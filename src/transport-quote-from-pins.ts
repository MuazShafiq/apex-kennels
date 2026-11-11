import {buildApexInvoiceDraft,type ApexDraftInput,type ApexDraftQuote}
  from './apex-invoice-draft.ts';
import {buildApexDraftWithFreshFuel,type FuelDraftResult}
  from './transport-invoice-draft-service.ts';
import {routeApexTransport,type RouteRequest,type RouteResult}
  from './transport-route.ts';
import type {PetrolRateResult} from './islamabad-petrol-rate.ts';

export type CoordinatedDraft={
  draft:ApexDraftQuote;
  route:RouteResult;
  fuelLookup:FuelDraftResult['fuelLookup']|'ROUTE_MISSING';
};

/**
 * Future staff workflow entrypoint: verified pins -> actual drivable vehicle
 * loop distance -> current fuel baseline -> REVIEW ONLY draft. No real data
 * is pulled from the Form/DB here, and this is not deployed on a route yet.
 */
export async function preparePinnedTransportDraft(
  input:ApexDraftInput,
  location:RouteRequest,
  options:{
    geoapifyKey?:string;
    route?:()=>Promise<RouteResult>;
    fetchFuel?:()=>Promise<PetrolRateResult>;
  }={}
):Promise<CoordinatedDraft>{
  if(!input.transport?.requested) {
    return {
      draft:buildApexInvoiceDraft(input),
      route:{ok:false,reason:'INVALID_VISITS',detail:'No transport requested'},
      fuelLookup:'NOT_REQUIRED'
    };
  }
  const route=await (options.route??(()=>routeApexTransport(location,{apiKey:options.geoapifyKey})))();
  if(!route.ok) {
    // Do not fetch petrol if the destination is unknown. Do not accept a
    // caller-supplied invented distance or stale fuel price as a fallback.
    const draft=buildApexInvoiceDraft({...input,transport:{
      requested:true,profitBasis:input.transport.profitBasis,
    }});
    draft.unresolved.push('Transport unpriced: '+route.detail);
    return {draft,route,fuelLookup:'ROUTE_MISSING'};
  }
  // The routing result, not an old client quantity, supplies the distance.
  const price=await buildApexDraftWithFreshFuel({...input,transport:{
    requested:true,
    totalDrivenKm:route.estimate.totalDrivenKm,
    profitBasis:input.transport.profitBasis,
  }},options.fetchFuel);
  price.draft.unresolved.push('Route '+route.estimate.loopDistanceKm+' km round trip; 
    +route.estimate.plannedRoundTrips+' planned trips, review entrance/access and actual vehicle journey'+
    (route.estimate.dropoffLoopDistanceKm!==undefined
      ? '; separate drop-off loop '+route.estimate.dropoffLoopDistanceKm+' km'
      : ''));
  return {draft:price.draft,route,fuelLookup:price.fuelLookup};
}
