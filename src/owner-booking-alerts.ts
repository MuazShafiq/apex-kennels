import type {IntakeRequest} from './intake.ts';
import {normalizePakistanWhatsappPhone,type WhatsappConfig} from './whatsapp-cloud.ts';
import {validateDeliveryConfig} from './invoice-delivery.ts';

export type OwnerAlertIntent={recipient:string;template:string;senderId:string;consent:{purpose:'owner_booking_alert';consentedAt:string;evidence:string}};
export type OwnerAlertConfig=WhatsappConfig&{enabled?:string;recipient:string;template:string;consentedAt:string;consentEvidence:string};
export function validateOwnerAlertConfig(config:OwnerAlertConfig):OwnerAlertIntent {
  validateDeliveryConfig({...config,language:'en_US'});
  const time=Date.parse(config.consentedAt);
  if(!Number.isFinite(time)||time>Date.now()||!config.consentEvidence.trim()||config.consentEvidence.length>200||/[\x00-\x1f\x7f]/.test(config.consentEvidence))throw new Error('Explicit owner alert consent required');
  return {recipient:normalizePakistanWhatsappPhone(config.recipient),template:config.template,senderId:config.phoneNumberId,
    consent:{purpose:'owner_booking_alert',consentedAt:new Date(time).toISOString(),evidence:config.consentEvidence.trim()}};
}
export function isSyntheticAlertBooking(input:IntakeRequest):boolean {
  return /^(?:APEX CANARY|SYNTHETIC|TEST ONLY)/i.test(input.customerName.trim())||
    /APEX SYNTHETIC CANARY/i.test(input.petName)||/^apex-cf-smoke-/i.test(input.externalResponseId);
}
