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

- `output/apex-access-road-review.html` — Leaflet/OpenStreetMap viewer with the two directions overlaid, snap distances and warnings; needs an internet connection to load map tiles and Leaflet.
- `output/apex-access-road-review.json` — provider's geometry, distances and times, sanitized. It contains no API key or customer information.

The terminal also prints the two distances, road snap distances and total loop. This is not an actual pickup quote or a routing validation approval.

## How to interpret the result

1. Compare the colored route traces with the approach road that Fatima or her driver actually uses. Route **must reach the correct kennel vehicle gate via the Bawli access road**, not an invented shortcut.
2. Check the **snap distances**: more than 150m from either point is flagged. A small distance is NOT proof of a valid road; the mapped restaurant centre is not necessarily the exact junction.
3. A provider route with impossible cuts, disconnected paths or wrong gate means **no transport charge**. Adjust the intermediate access waypoint to the actual *drivable road junction*, not an arbitrary building centroid, then rerun and inspect.
4. Once real access is validated, configure `GEOAPIFY_API_KEY` securely in Cloudflare and add customer-confirmed collection pins to a staff-only, approved route/quote workflow. This is **not connected to production** yet.
5. Bawli in the customer route is a **pass-through shaping waypoint** (`intermediate_waypoint_mode=pass_through`), not a stop to buy anything. The proper quote will include the customer location and real vehicle distance for each direction.

If Geoapify cannot return valid road geometry, use a different routing provider or manually review the route; do not invent kilometres or treat straight-line distance as the road distance.
