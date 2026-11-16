import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocationSearchBudget,consumeLocationSearchBudget,LOCATION_SEARCH_DAILY_LIMIT,type BudgetState,type BudgetTransaction,type LocationSearchBudgetNamespace} from './location-search-budget.ts';
const url='https://location-search-budget.internal/consume';
const request=()=>new Request(url,{method:'POST'});
/** Serial transactional fake shares durable state across separate object instances. */
function storage(){
 let counter:unknown,queue=Promise.resolve();let failed=false;
 const keys:string[]=[];
 const state:BudgetState={storage:{transaction:async<T>(callback:(transaction:BudgetTransaction)=>Promise<T>)=>{
  const before=queue;let release!:()=>void;queue=new Promise<void>(r=>{release=r;});await before;
  try{if(failed)throw new Error('Private storage failure must not leak');let pending=structuredClone(counter);
   const result=await callback({get:async<T>(key:string)=>{keys.push(key);await Promise.resolve();return structuredClone(pending) as T|undefined;},put:async<T>(key:string,value:T)=>{keys.push(key);pending=structuredClone(value);}});
   counter=pending;return result;
  }finally{release();}
 }}};
 return {state,keys,read:()=>structuredClone(counter),fail:()=>{failed=true;},seed:(v:unknown)=>{counter=v;}};
}
test('global daily budget is exact under concurrent requests and persists across object restarts',async()=>{
 const db=storage(),clock=()=>Date.parse('2026-11-16T23:59:59Z');
 const first=new LocationSearchBudget(db.state,undefined,clock),second=new LocationSearchBudget(db.state,undefined,clock);
 const results=await Promise.all(Array.from({length:LOCATION_SEARCH_DAILY_LIMIT+50},(_,i)=>(i%2?first:second).fetch(request()).then(r=>r.json() as Promise<{success:boolean}>)));
 assert.equal(results.filter(x=>x.success).length,LOCATION_SEARCH_DAILY_LIMIT);
 const restarted=new LocationSearchBudget(db.state,undefined,clock);assert.deepEqual(await (await restarted.fetch(request())).json(),{success:false});
 assert.deepEqual(db.read(),{day:'2026-11-16',count:250});assert(db.keys.every(k=>k==='daily'));
});
test('UTC rollover grants only the next daily allocation and clock rollback fails closed',async()=>{
 const db=storage();let at=Date.parse('2026-11-16T23:59:59.999Z');const obj=new LocationSearchBudget(db.state,undefined,()=>at);
 db.seed({day:'2026-11-16',count:250});assert.deepEqual(await (await obj.fetch(request())).json(),{success:false});
 at++;assert.deepEqual(await (await obj.fetch(request())).json(),{success:true});assert.deepEqual(db.read(),{day:'2026-11-17',count:1});
 at--;assert.equal((await obj.fetch(request())).status,503);assert.deepEqual(db.read(),{day:'2026-11-17',count:1});
});
test('invalid internal calls, unavailable/corrupt storage and invalid time never grant budget or expose failure text',async()=>{
 const db=storage(),obj=new LocationSearchBudget(db.state,undefined,()=>Date.parse('2026-11-16T12:00:00Z'));
 for(const req of [new Request(url),new Request(url+'?query=private',{method:'POST'}),new Request('https://public.example/consume',{method:'POST'}),new Request(url,{method:'POST',body:'private location'})]){assert.equal((await obj.fetch(req)).status,400);}
 assert.equal(db.read(),undefined);
 for(const value of [null,[],{day:'2026-11-16',count:0,query:'must not be stored'},{day:'2020-99-99',count:0},{day:'bad',count:0},{day:'2026-11-16',count:-1},{day:'2026-11-16',count:251},{day:'2026-11-16',count:NaN}]){db.seed(value);const result=await obj.fetch(request());assert.equal(result.status,503);assert.equal(await result.text(),'{"success":false}');}
 db.fail();assert.equal((await obj.fetch(request())).status,503);
 assert.equal((await new LocationSearchBudget(storage().state,undefined,()=>NaN).fetch(request())).status,503);
});
test('binding helper always uses the singleton and exact empty internal request, never retries or refunds',async()=>{
 const db=storage(),obj=new LocationSearchBudget(db.state);let calls=0;
 const namespace:LocationSearchBudgetNamespace={idFromName:name=>{assert.equal(name,'search-v1');return 'one-global-id';},get:id=>{assert.equal(id,'one-global-id');return {fetch:async req=>{calls++;assert.equal(req.url,url);assert.equal(req.method,'POST');assert.equal(req.body,null);assert.equal([...req.headers].length,0);return obj.fetch(req);}};}};
 assert.deepEqual(await consumeLocationSearchBudget(namespace),{success:true});assert.equal(calls,1);
 assert.equal((db.read() as {count:number}).count,1); // downstream provider failure cannot refund this count
 assert.deepEqual(await consumeLocationSearchBudget(),{success:false});
 for(const response of [new Response('private storage error',{status:503}),Response.json({success:true,query:'private'}),Response.json({success:'true'}),new Response('x'.repeat(100)),new Response('not json')]){
  const bad={idFromName:()=>0,get:()=>({fetch:async()=>response})};assert.deepEqual(await consumeLocationSearchBudget(bad),{success:false});
 }
 assert.deepEqual(await consumeLocationSearchBudget({idFromName:()=>{throw new Error('secret');},get:()=>{throw new Error('secret');}}),{success:false});
});

test('unapplied configuration example uses SQLite and isolated preview namespaces; production remains unconfigured',()=>{
 const config=JSON.parse(readFileSync(new URL('../docs/examples/location-search-wrangler.jsonc',import.meta.url),'utf8'));
 assert.deepEqual(config.migrations,[{tag:'location-search-budget-v1',new_sqlite_classes:['LocationSearchBudget']}]);
 assert.deepEqual(config.durable_objects.bindings,[{name:'LOCATION_SEARCH_BUDGET',class_name:'LocationSearchBudget'}]);
 assert.deepEqual(config.previews.durable_objects,config.durable_objects);
 const production=config.ratelimits,preview=config.previews.ratelimits;
 assert.deepEqual(production.map((x:{simple:unknown})=>x.simple),[{limit:10,period:60},{limit:30,period:60}]);
 assert.equal(new Set([...production,...preview].map((x:{namespace_id:string})=>x.namespace_id)).size,4);
 const staging=JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc',import.meta.url),'utf8'));
 assert.notEqual(staging.name,config.name);assert.equal(staging.durable_objects,undefined);assert.equal(staging.ratelimits,undefined);
 const productionConfig=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(productionConfig.durable_objects,undefined);assert.equal(productionConfig.ratelimits,undefined);assert.equal(productionConfig.migrations,undefined);
});
