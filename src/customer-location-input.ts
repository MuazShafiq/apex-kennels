/** A single owner-selected pickup/dropoff entrance. Not yet a verified drivable road. */
export type CustomerLocation={
  latitude:number;longitude:number;service:'pickup'|'dropoff'|'both';
  customerConfirmed:true;
};
export function validateCustomerLocation(value:unknown):CustomerLocation{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid location');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='customerConfirmed,latitude,longitude,service')
    throw new Error('Unexpected location fields');
  if(typeof v.latitude!=='number'||typeof v.longitude!=='number'||
    !Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||
    v.latitude<23||v.latitude>38||v.longitude<60||v.longitude>78)
    throw new Error('Choose a location in Pakistan');
  if(v.service!=='pickup'&&v.service!=='dropoff'&&v.service!=='both')
    throw new Error('Choose pickup, drop-off, or both');
  if(v.customerConfirmed!==true)throw new Error('Confirm the selected location');
  return {latitude:v.latitude,longitude:v.longitude,service:v.service,
    customerConfirmed:true};
}
