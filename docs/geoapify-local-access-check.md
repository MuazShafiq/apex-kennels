# Geoapify local access-road validation

**Purpose:** Test the real road between Bawli Restaurant and Apex Kennels BEFORE integrating customer transport quotes. This is NOT a billable quote and does not change production bookings, database data, or Cloudflare secrets.

## Windows PowerShell (key is never typed into a command or committed)

From `C:\Users\muazs\Downloads\apex-kennels`:

```powershell
git switch main
git pull --ff-only

$secret = Read-Host "Geoapify API key" -AsSecureString
$env:GEOAPIFY_API_KEY = [System.Net.NetworkCredential]::new("", $secret).Password
npm.cmd run route:check:access
Remove-Item Env:\GEOAPIFY_API_KEY
Remove-Variable secret
```

The hidden prompt keeps the key out of PowerShell command history and console echo. **Do not send the key in chat**, place it in a public command, use `setx`, commit it, or share a Geoapify request URL containing `apiKey`.

The script uses the owner-provided kennel site coordinate `33.2992325,73.2534561` and mapped restaurant centre `33.31392,73.25810`, makes two server-side Geoapify driving requests and stores **sanitized results without the key** under ignored `output/`:

- `output/apex-access-road-review.html` — Leaflet viewer with both directions, snap distances and warnings. It uses a **local Geoapify basemap PNG**, NOT public OSM tiles. The Leaflet JavaScript/CSS still loads from unpkg when the file is opened.
- `output/apex-access-road-review.json` — provider's geometry, distances and times, sanitized. It contains no API key or customer information.
- `output/apex-access-basemap.png` — locally saved raster background fetched **server-side** from Geoapify Static Maps API, with no key embedded in the HTML or image URL. If the PNG request fails (e.g. Static Maps API permission), a warning appears and route geometry is still displayed, but visually validating the road must wait for a background map.

The terminal also prints the two distances, road snap distances and total loop. This is not an actual pickup quote or a routing validation approval.

## How to interpret the result

1. Compare the colored route traces with the approach road that Fatima or her driver actually uses. Route **must reach the correct kennel vehicle gate via the Bawli access road**, not an invented shortcut.
2. Check the **snap distances**: more than 150m from either point is flagged. A small distance is NOT proof of a valid road; the mapped restaurant centre is not necessarily the exact junction.
3. A provider route with impossible cuts, disconnected paths or wrong gate means **no transport charge**. Adjust the intermediate access waypoint to the actual *drivable road junction*, not an arbitrary building centroid, then rerun and inspect.
4. Once real access is validated, configure `GEOAPIFY_API_KEY` securely in Cloudflare and add customer-confirmed collection pins to a staff-only, approved route/quote workflow. This is **not connected to production** yet.
5. Bawli is a **mandatory routing waypoint**, not a stop to buy anything. Geoapify's global `pass_through` option would also bypass the actual customer pickup stop in our current five-point request, so it is NOT enabled. Before live transport billing, we should model the actual customer service stop separately from Bawli's road-shaping point, validating both driven directions.

If Geoapify cannot return valid road geometry, use a different routing provider or manually review the route; do not invent kilometres or treat straight-line distance as the road distance.


## Screenshot's original 403 cause and fix

The original local `file://` Leaflet viewer fetched public raster tiles from `tile.openstreetmap.org`. The OSM Foundation may block those requests when its usage requirements such as HTTP Referer and appropriate usage are not met. The original screenshot showed its "Access blocked" policy image even though the **Geoapify routing API succeeded**. The local preview no longer contacts OSM's volunteer tile servers. It downloads a single Geoapify Static Maps PNG with the private key in a temporary Node request, and serves the resulting image from `output/`. We display attribution to Geoapify and OpenStreetMap. Re-run the **same** `npm.cmd run route:check:access` command with the key entered through `Read-Host -AsSecureString`, and reopen the HTML in the browser. If the basemap cannot be obtained, the script prints a warning; do not interpret the resulting route-only overlay as proof of a real road.
