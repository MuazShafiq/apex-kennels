/** Shared conservative classification; an explicit false cannot clear a marker. */
export function isSyntheticBooking(input:{customerName?:string;petName?:string;externalResponseId?:string;additionalDogs?:readonly {petName:string}[]}):boolean {
  return /^(?:APEX CANARY|SYNTHETIC|TEST ONLY)/i.test(input.customerName?.trim()??'')||
    /APEX SYNTHETIC CANARY/i.test(input.petName??'')||
    input.additionalDogs?.some(dog=>/APEX SYNTHETIC CANARY/i.test(dog.petName))===true||
    /^apex-cf-smoke-/i.test(input.externalResponseId?.trim()??'');
}
