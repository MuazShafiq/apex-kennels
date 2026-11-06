/**
 * Apex pickup/drop-off coverage for the Islamabad–Rawalpindi urban area.
 *
 * This is a deliberately conservative operating envelope, NOT the legal
 * municipal boundary of either city. Edge cases still need staff review.
 * Ordered: [west longitude, south latitude, east longitude, north latitude].
 */
export const TRANSPORT_SERVICE_BOUNDS=[72.81,33.43,73.30,33.84] as const;
export const TRANSPORT_SERVICE_NAME='Islamabad and Rawalpindi';

export function isTransportServiceLocation(latitude:number,longitude:number):boolean {
  const [west,south,east,north]=TRANSPORT_SERVICE_BOUNDS;
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&
    longitude>=west&&longitude<=east&&latitude>=south&&latitude<=north;
}
