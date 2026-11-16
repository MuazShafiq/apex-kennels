import type {Quote} from './pricing.ts';

export type OwnerEditRows={lines:{label:string;quantity:number;unitPricePkr:number}[];discounts:{label:string;amountPkr:number}[]};
export type OwnerEditAudit={revision:number;actor:string;at:string;action:'edit'|'reset'|'undo';totalPkr:number};
export type OwnerOverride={version:1;sourceQuote:Quote;previousQuote?:Quote;history:OwnerEditAudit[]};
export class OwnerPricingError extends Error {readonly status=422;}
const fail=(message:string):never=>{throw new OwnerPricingError(message);};
function label(v:unknown):string {
  if(typeof v!=='string'||!v.trim()||v.length>160||/[^\u0020-\u007e\u00a0-\u00ff\u2013-\u2014\u2018-\u2019\u201c-\u201d]/u.test(v)||/[<>]/.test(v))fail('Use a plain invoice description of 1–160 supported characters');
  return (v as string).trim();
}
function money(v:unknown):number {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)fail('Amounts must be non-negative whole PKR within integer limits');return v as number;}
function sum(a:number,b:number):number {return money(a+b);}
/** Project only accepted inputs. Client totals, source evidence and identity are never accepted. */
export function calculateOwnerQuote(source:Quote,input:unknown):Quote {
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid invoice rows');
  const v=input as OwnerEditRows;
  if(!Array.isArray(v.lines)||v.lines.length>60||!Array.isArray(v.discounts)||v.discounts.length>20)fail('Use at most 60 invoice rows and 20 discounts');
  const lines=v.lines.map(l=>{
    if(!l||typeof l!=='object'||!Number.isSafeInteger(l.quantity)||l.quantity<1)fail('Quantities must be positive whole numbers');
    const unitPricePkr=money(l.unitPricePkr),quantity=l.quantity;
    return {label:label(l.label),quantity,unitPricePkr,totalPkr:money(quantity*unitPricePkr)};
  });
  const discounts=v.discounts.map(d=>{if(!d||typeof d!=='object')fail('Invalid discount');return {source:'manual' as const,label:label(d.label),amountPkr:money(d.amountPkr)};});
  const subtotalPkr=lines.reduce((a,l)=>sum(a,l.totalPkr),0),discount=discounts.reduce((a,d)=>sum(a,d.amountPkr),0);
  if(discount>subtotalPkr)fail('Discounts cannot make the payable total negative');
  return {startDate:source.startDate,endDate:source.endDate,billedDays:source.billedDays,currency:'PKR',lines,discounts,subtotalPkr,totalPkr:subtotalPkr-discount};
}
export function validateOwnerQuote(q:Quote,source:Quote):Quote {
  const calculated=calculateOwnerQuote(source,q);
  if(q.currency!=='PKR'||q.startDate!==source.startDate||q.endDate!==source.endDate||q.billedDays!==source.billedDays||q.subtotalPkr!==calculated.subtotalPkr||q.totalPkr!==calculated.totalPkr||q.lines.some((l,i)=>l.totalPkr!==calculated.lines[i].totalPkr))fail('Owner invoice arithmetic does not match its rows');
  return calculated;
}
