import {IntakeError} from './intake-error.ts';

/**
 * Sensitive operational answers from Apex's five-section Google Form.
 * Restrict to explicitly supported fields. Never log or return these in public APIs.
 */
export type PersonalityTrait = 'friendly' | 'fears' | 'climber' | 'foodSensitivities' |
  'barksExcessively' | 'allergies' | 'biteHistory' | 'medicalConditions';
export type BoardingDetails = {
  ownerAddress?: string;
  pickupDropoffRequested?: boolean;
  cameraCageRequested?: boolean;
  emergencyContactPhone?: string;
  breed?: string;
  gender?: string;
  age?: string;
  vaccinationStatus?: string;
  distemperHistory?: string;
  veterinarianPhone?: string;
  personalityTraits?: Partial<Record<PersonalityTrait, boolean>>;
  specialInstructions?: string;
  medicationFeedingInstructions?: string;
  termsAccepted?: boolean;
};
const TRAITS: readonly PersonalityTrait[] = [
  'friendly','fears','climber','foodSensitivities','barksExcessively',
  'allergies','biteHistory','medicalConditions'
];
const VACCINATION = [
  'Fully vaccinated and booster is up to date',
  'Fully vaccinated without boosters',
  'Partially vaccinated',
  'None'
] as const;
const DISTEMPER = ['Yes','No','Not Sure'] as const;

function optionalText(value: unknown, name: string, max: number, multiline = false): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new IntakeError('Invalid '+name);
  const normalized=value.trim();
  if (!normalized || normalized.length > max || (multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
    : /[\u0000-\u001f\u007f]/.test(normalized))) throw new IntakeError('Invalid '+name);
  return normalized;
}

function optionalBool(value:unknown, name:string):boolean|undefined {
  if (value===undefined || value===null) return undefined;
  if (typeof value!=='boolean') throw new IntakeError('Invalid '+name);
  return value;
}

/** An absent details object is valid for legacy synthetic intake tests. */
export function parseBoardingDetails(value:unknown): BoardingDetails|undefined {
  if (value===undefined || value===null) return undefined;
  if (typeof value!=='object' || Array.isArray(value)) throw new IntakeError('Invalid details object');
  const row=value as Record<string,unknown>;
  const allowed=[
    'ownerAddress','pickupDropoffRequested','cameraCageRequested','emergencyContactPhone',
    'breed','gender','age','vaccinationStatus','distemperHistory','veterinarianPhone',
    'personalityTraits','specialInstructions','medicationFeedingInstructions','termsAccepted'
  ];
  if (Object.keys(row).some(key=>!allowed.includes(key))) throw new IntakeError('Unexpected details field');

  const traits= row.personalityTraits;
  let personalityTraits:BoardingDetails['personalityTraits'];
  if (traits!==undefined && traits!==null) {
    if(typeof traits!=='object'||Array.isArray(traits)) throw new IntakeError('Invalid personalityTraits');
    personalityTraits={};
    for(const [key,traitValue] of Object.entries(traits as Record<string,unknown>)){
      if(!TRAITS.includes(key as PersonalityTrait) || typeof traitValue!=='boolean') {
        throw new IntakeError('Invalid personalityTraits value');
      }
      personalityTraits[key as PersonalityTrait]=traitValue;
    }
  }
  const vaccinationStatus=optionalText(row.vaccinationStatus,'vaccinationStatus',120);
  if(vaccinationStatus && !(VACCINATION as readonly string[]).includes(vaccinationStatus)) {
    throw new IntakeError('Invalid vaccinationStatus');
  }
  const distemperHistory=optionalText(row.distemperHistory,'distemperHistory',30);
  if(distemperHistory && !(DISTEMPER as readonly string[]).includes(distemperHistory)){
    throw new IntakeError('Invalid distemperHistory');
  }
  const details:BoardingDetails={
    ownerAddress:optionalText(row.ownerAddress,'ownerAddress',600,true),
    pickupDropoffRequested:optionalBool(row.pickupDropoffRequested,'pickupDropoffRequested'),
    cameraCageRequested:optionalBool(row.cameraCageRequested,'cameraCageRequested'),
    emergencyContactPhone:optionalText(row.emergencyContactPhone,'emergencyContactPhone',120),
    breed:optionalText(row.breed,'breed',140),
    gender:optionalText(row.gender,'gender',80),
    age:optionalText(row.age,'age',100),
    vaccinationStatus,
    distemperHistory,
    veterinarianPhone:optionalText(row.veterinarianPhone,'veterinarianPhone',120),
    personalityTraits,
    specialInstructions:optionalText(row.specialInstructions,'specialInstructions',3000,true),
    medicationFeedingInstructions:optionalText(row.medicationFeedingInstructions,'medicationFeedingInstructions',3000,true),
    termsAccepted:optionalBool(row.termsAccepted,'termsAccepted')
  };
  // Presence of a details object means a full real Form response, not an
  // incomplete partial record. Optional care notes and the trait grid may be empty.
  for (const field of ['ownerAddress','emergencyContactPhone','breed','gender','age','vaccinationStatus','distemperHistory'] as const) {
    if (!details[field]) throw new IntakeError('Missing required '+field);
  }
  if (details.pickupDropoffRequested===undefined || details.cameraCageRequested===undefined) {
    throw new IntakeError('Missing boarding add-on choices');
  }
  if (details.termsAccepted!==true) throw new IntakeError('Terms acknowledgement required');
  return Object.fromEntries(Object.entries(details).filter(([,v])=>v!==undefined));
}
