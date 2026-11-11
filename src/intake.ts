import { createHash } from 'node:crypto';
import {parseBoardingDetails, PERSONALITY_TRAITS, type BoardingDetails} from './boarding-details.ts';
import {IntakeError} from './intake-error.ts';
import {validateCustomerLocation,type CustomerLocation} from './customer-location-input.ts';
export {IntakeError} from './intake-error.ts';

export type IntakeRequest = {
  source: 'google_form' | 'website';
  externalResponseId: string;
  customerName: string;
  email?: string;
  phone?: string;
  petName: string;
  startDate: string;
  endDate: string;
  accommodationType?: string;
  details?: BoardingDetails;
  transportLocation?: CustomerLocation;
};


function textField(value: unknown, name: string, max = 200, required = true): string | undefined {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (typeof value !== 'string') throw new IntakeError(`${name} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new IntakeError(`Invalid ${name}`);
  }
  return normalized;
}

function checkDate(value: string, name: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new IntakeError(`Invalid ${name}`);
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  if (new Date(ms).toISOString().slice(0, 10) !== value) throw new IntakeError(`Invalid ${name}`);
  return ms;
}

/** Only the fields explicitly mapped by a trusted Google Forms adapter may enter the system. */
export function parseIntake(value: unknown, expectedSource: 'google_form'|'website'='google_form'): IntakeRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IntakeError('Expected a JSON object');
  }
  const row = value as Record<string, unknown>;
  if (row.source !== expectedSource) throw new IntakeError('Unsupported booking source');
  const externalResponseId = textField(row.externalResponseId, 'externalResponseId', 160)!;
  if(expectedSource==='website' && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(externalResponseId)) {
    throw new IntakeError('Invalid website submission identifier');
  }
  const customerName = textField(row.customerName, 'customerName')!;
  const email = textField(row.email, 'email', 254, false)?.toLowerCase();
  const phone = textField(row.phone, 'phone', 40, false);
  if (!email && !phone) throw new IntakeError('A contact email or phone is required');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IntakeError('Invalid email');
  const petName = textField(row.petName, 'petName')!;
  const startDate = textField(row.startDate, 'startDate', 10)!;
  const endDate = textField(row.endDate, 'endDate', 10)!;
  const start = checkDate(startDate, 'startDate');
  const end = checkDate(endDate, 'endDate');
  if (end < start || (end - start) / 86400000 > 366) throw new IntakeError('Invalid stay duration');
  const accommodationType = textField(row.accommodationType, 'accommodationType', 120, false);
  const details = parseBoardingDetails(row.details);
  if(details?.whatsappInvoiceOptIn===true && !phone)
    throw new IntakeError('WhatsApp consent requires a contact phone number');
  if(expectedSource==='website' && !details)throw new IntakeError('Website booking requires full boarding details');
  if(expectedSource==='website' && details?.termsAccepted!==true)throw new IntakeError('Terms acknowledgement required');
  // The public form requires a usable phone number and every care-safety answer.
  // Legacy Google Form intake remains unchanged, including historic partial data.
  if(expectedSource==='website'){
    if(!phone)throw new IntakeError('Phone number is required for website bookings');
    if(!details?.personalityTraits ||
       PERSONALITY_TRAITS.some(trait=>typeof details.personalityTraits?.[trait]!=='boolean'))
      throw new IntakeError('Complete all care questions');
  }
  let transportLocation:CustomerLocation|undefined;
  if(expectedSource==='website') {
    if(details?.pickupDropoffRequested===true){
      if(row.transportLocation===undefined)throw new IntakeError('Pickup location is required');
      try{transportLocation=validateCustomerLocation(row.transportLocation);}
      catch{throw new IntakeError('Invalid pickup location');}
    } else if(row.transportLocation!==undefined && row.transportLocation!==null){
      throw new IntakeError('Unexpected pickup location');
    }
  }
  return { source:expectedSource, externalResponseId, customerName, email, phone, petName,
    startDate, endDate, accommodationType, details, ...(transportLocation?{transportLocation}:{}) };
}

/** Canonical immutable import identity; does not contain invoice prices or private tokens. */
export function fingerprintIntake(input: IntakeRequest): string {
  return createHash('sha256').update(JSON.stringify({
    source: input.source, externalResponseId: input.externalResponseId,
    customerName: input.customerName, email: input.email ?? null,
    phone: input.phone ?? null, petName: input.petName,
    startDate: input.startDate, endDate: input.endDate,
    accommodationType: input.accommodationType ?? null,
    details: input.details ?? null,
    ...(input.source==='website' ? {transportLocation:input.transportLocation??null} : {})
  })).digest('hex');
}
