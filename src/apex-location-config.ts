import type {GeoPin} from './transport-route.ts';

/**
 * Site point provided by Muaz in this conversation. It identifies the kennel
 * LOCATION, but has NOT been independently road-entrance verified.
 * Exact access route requires a separate restaurant/road waypoint.
 * No customer data lives in this file.
 */
export const APEX_KENNEL_LOCATION = Object.freeze({
  pin: {lat:33.2992325,lon:73.2534561} as GeoPin,
  rawDms: "33°17'57.2\"N 73°15'12.4\"E",
  mapUrl: 'https://www.google.com/maps/place/33%C2%B017%2757.2%22N+73%C2%B015%2712.4%22E/@33.2992325,73.2508812,17z/data=!3m1!4b1!4m4!3m3!8m2!3d33.2992325!4d73.2534561',
  entranceConfirmed: false,
});

export const APEX_KENNEL_ACCESS = Object.freeze({
  name: 'Bawli Restaurant (also mapped as Bawali Hotel)',
  originalMapLink: 'https://maps.app.goo.gl/x7KMJZuXFG74HqQg8',
  /**
   * Mapped OSM building centre (way 256757113), NOT necessarily the road
   * junction where the driver must turn. Muaz confirmed this is the intended
   * Bawli restaurant. Source: https://mapcarta.com/W256757113
   */
  pin: {lat:33.31392,lon:73.25810} as GeoPin,
  pinSource: 'OpenStreetMap way 256757113 via Mapcarta',
  businessIdentityConfirmedByOwner: true,
  /** Location lookup identified; the actual driveable approach is not tested. */
  pinConfirmed: true,
  roadApproachValidated: false,
  mandatoryForTravelToAndFromKennel: true,
});
