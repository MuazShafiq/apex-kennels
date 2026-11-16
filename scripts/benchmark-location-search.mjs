/** Bounded seven-query live benchmark. Existing private key only; never provisions services. */
import {searchLocalPlaces} from '../src/place-search.ts';
const key=process.env.GEOAPIFY_API_KEY?.trim();
if(!key){console.error('Existing private GEOAPIFY_API_KEY required; no provider call made.');process.exitCode=1;}
else{
  const queries=['F-10 Markaz Islamabad','DHA Phase II Islamabad','Bahria Town Phase 7 Rawalpindi','G-13 Islamabad','Saddar Rawalpindi','US Embassy Islamabad','Centaurus Islamabad'];
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),provider:'Geoapify autocomplete',filter:'rect:72.81,33.43,73.3,33.84',bias:'proximity:73.06,33.65',queries:queries.length}));
  for(const query of queries){
    try{console.log(JSON.stringify({query,rankedResults:await searchLocalPlaces(query,key)}));}
    catch{console.log(JSON.stringify({query,error:'Provider unavailable; inspect account privately.'}));process.exitCode=1;}
  }
}
