export type CustomerLocation = {latitude:number;longitude:number;service:'pickup'|'dropoff'|'both'};

export function validateCustomerLocation(value:unknown):CustomerLocation {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Invalid location');
  const v=value as Record<string,unknown>;
  if(typeof v.latitude!=='number'||typeof v.longitude!=='number'||
    !Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||
    v.latitude<23||v.latitude>38||v.longitude<60||v.longitude>78){
    throw new Error('Choose an exact location in Pakistan');
  }
  if(v.service!=='pickup'&&v.service!=='dropoff'&&v.service!=='both')throw new Error('Choose a transport service');
  return {latitude:v.latitude,longitude:v.longitude,service:v.service};
}
