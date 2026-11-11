import {isTransportServiceLocation} from './transport-service-area.ts';

/** The primary owner-selected entrance: pickup when both are requested, otherwise the selected service. */
export type CustomerLocation={
  latitude:number;longitude:number;service:'pickup'|'dropoff'|'both';
  customerConfirmed:true;
};
export type DropoffLocation={latitude:number;longitude:number;customerConfirmed:true};
export function validateDropoffLocation(value:unknown):DropoffLocation {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid drop-off location');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='customerConfirmed,latitude,longitude' ||
     typeof v.latitude!=='number'||typeof v.longitude!=='number'||
     !isTransportServiceLocation(v.latitude,v.longitude)||v.customerConfirmed!==true)
    throw new Error('Invalid drop-off location');
  return {latitude:v.latitude,longitude:v.longitude,customerConfirmed:true};
}
export function validateCustomerLocation(value:unknown):CustomerLocation{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid location');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='customerConfirmed,latitude,longitude,service')
    throw new Error('Unexpected location fields');
  if(typeof v.latitude!=='number'||typeof v.longitude!=='number'||
    !isTransportServiceLocation(v.latitude,v.longitude))
    throw new Error('Pickup and drop-off are available only within Islamabad and Rawalpindi');
  if(v.service!=='pickup'&&v.service!=='dropoff'&&v.service!=='both')
    throw new Error('Choose pickup, drop-off, or both');
  if(v.customerConfirmed!==true)throw new Error('Confirm the selected location');
  return {latitude:v.latitude,longitude:v.longitude,service:v.service,
    customerConfirmed:true};
}
