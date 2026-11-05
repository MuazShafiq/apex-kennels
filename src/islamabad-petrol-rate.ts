/**
 * Source-backed national petrol rate used as an Islamabad QUOTE BASELINE.
 * This is NOT an Islamabad pump-specific forecourt price. Secondary freight
 * can add to OGRA's national notified rate; staff must review transport.
 *
 * OilPrices.pk is an independent CC BY 4.0 parser of OGRA notifications.
 * GitHub mirror is a FALLBACK of the same publisher, not independent corroboration.
 * Source attribution: https://oilprices.pk/fuel-price-api-pakistan
 */
export const FUEL_SOURCE = {
  primary: 'https://oilprices.pk/api/latest',
  mirror: 'https://raw.githubusercontent.com/quantanow/pakistan-fuel-prices/main/data/latest.json',
  attribution: 'Fuel price data from OilPrices.pk, CC BY 4.0',
} as const;

export type VerifiedPetrolRate = {
  product: 'Motor Spirit (Petrol)';
  pricePkrPerLitre: number;
  currency: 'PKR';
  unit: 'litre';
  effectiveDate: string;
  retrievedAt: string;
  publisher: 'OilPrices.pk';
  notificationAuthority: 'OGRA';
  sourceUrl: string;
  /** Cannot claim this equals an individual Islamabad pump price. */
  geographicBasis: 'Pakistan national notified price; Islamabad pump freight excluded';
  daysSinceEffective: number;
  requiresStaffReview: true;
};

export type PetrolRateResult =
  | {ok: true; rate: VerifiedPetrolRate}
  | {ok: false; reason: 'UNAVAILABLE_OR_UNVERIFIED'; detail: string};

type Fetcher = typeof fetch;

function localDateInIslamabad(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Karachi', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now);
  const get = (type:string)=>parts.find(x=>x.type===type)?.value;
  return [get('year'),get('month'),get('day')].join('-');
}

function safeDateMs(value:unknown): number {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid notification effective date');
  }
  const [y,m,d]=value.split('-').map(Number);
  const ms=Date.UTC(y,m-1,d);
  if(new Date(ms).toISOString().slice(0,10)!==value) {
    throw new Error('Non-calendar notification date');
  }
  return ms;
}

/**
 * Support the published GitHub latest.json object and flat array records.
 * Never infer petrol from diesel, LPG, kerosene, arbitrary numeric fields or
 * a chart projection. Unknown API response format fails closed.
 */
export function parseNotifiedPetrolRate(
  input:unknown,
  options:{now:Date; sourceUrl:string; maxAgeDays?:number}
):VerifiedPetrolRate {
  if(!input || typeof input!=='object') throw new Error('Invalid provider JSON');
  const container=input as Record<string,unknown>;
  const entries=Array.isArray(input)?input:
    Array.isArray(container.products)?container.products:
    Array.isArray(container.data)?container.data:
    Array.isArray(container.rates)?container.rates:null;
  if(!entries) throw new Error('Unrecognized price feed schema');
  const petrol=entries.filter((entry:unknown)=>{
    if(!entry || typeof entry!=='object')return false;
    const e=entry as Record<string,unknown>;
    return e.product==='Motor Spirit (Petrol)' || e.product==='Petrol';
  });
  if(petrol.length!==1) throw new Error('Petrol rate missing or ambiguous');
  const row=petrol[0] as Record<string,unknown>;
  if(row.unit!=='litre') throw new Error('Petrol rate is not PKR per litre');
  if(typeof row.pricePkr!=='number' || !Number.isFinite(row.pricePkr) ||
    row.pricePkr<150 || row.pricePkr>1000 ||
    Math.abs(Math.round(row.pricePkr*100)-row.pricePkr*100)>1e-6) {
    throw new Error('Petrol price is outside accepted bounds or precision');
  }
  const effectiveDate=(row.effectiveDate??container.effectiveDate) as unknown;
  const dayMs=safeDateMs(effectiveDate);
  const localDate=localDateInIslamabad(options.now);
  const todayMs=safeDateMs(localDate);
  const age=Math.round((todayMs-dayMs)/86_400_000);
  if(!Number.isSafeInteger(age) || age<0 || age>(options.maxAgeDays??7)) {
    throw new Error('Petrol notification is future-dated or stale');
  }
  return {
    product:'Motor Spirit (Petrol)',
    pricePkrPerLitre:row.pricePkr,
    currency:'PKR',unit:'litre',
    effectiveDate:effectiveDate as string,
    retrievedAt:options.now.toISOString(),
    publisher:'OilPrices.pk',
    notificationAuthority:'OGRA',
    sourceUrl:options.sourceUrl,
    geographicBasis:'Pakistan national notified price; Islamabad pump freight excluded',
    daysSinceEffective:age,
    requiresStaffReview:true,
  };
}

/**
 * Performs a network lookup EACH time it is called. No hardcoded PKR 400
 * fallback, no stale cached rate and no customer PII in outgoing requests.
 * This is intentionally invoked when a transport draft is requested, not
 * on every Form submission.
 */
export async function fetchCurrentIslamabadPetrolBaseline(options:{
  fetcher?:Fetcher;now?:Date;maxAgeDays?:number
}={}):Promise<PetrolRateResult> {
  const f=options.fetcher??fetch;
  const now=options.now??new Date();
  const attempts=[FUEL_SOURCE.primary,FUEL_SOURCE.mirror];
  const errors:string[]=[];
  for(const url of attempts) {
    try{
      const response=await f(url,{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{Accept:'application/json'},
        signal:AbortSignal.timeout(4500),
      });
      if(!response.ok) throw new Error('Provider HTTP '+response.status);
      const text=await response.text();
      if(text.length>32768) throw new Error('Oversized price response');
      const rate=parseNotifiedPetrolRate(JSON.parse(text),{
        now,sourceUrl:url,maxAgeDays:options.maxAgeDays
      });
      return {ok:true,rate};
    }catch(e){
      errors.push(url===FUEL_SOURCE.primary?'Primary unavailable or invalid':'Mirror unavailable or invalid');
    }
  }
  return {
    ok:false,
    reason:'UNAVAILABLE_OR_UNVERIFIED',
    detail:errors.join('; ') + '; staff must confirm a source-backed petrol price manually'
  };
}
