/** Actual local workerd/SQLite proof. No credentials, remote resources or provider calls. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const bundled=await build({stdin:{contents:'export {LocationSearchBudget} from "./src/location-search-budget.ts"; export default {fetch(){return new Response("No public budget route",{status:404})}};',
  resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const script=bundled.outputFiles[0].text;
const directory=await mkdtemp(join(tmpdir(),'apex-search-budget-'));
const options=convertV4MiniflareOptions({name:'apex-budget-local',modules:true,script,compatibilityDate:'2026-11-03',cf:false,
  durableObjects:{BUDGET:{className:'LocationSearchBudget',useSQLite:true}}});
options.resourcePersistencePath=directory;
let runtime;
const consume=async namespace=>{
  const stub=namespace.get(namespace.idFromName('search-v1'));
  const response=await stub.fetch('https://location-search-budget.internal/consume',{method:'POST'});
  assert.equal(response.status,200);return (await response.json()).success;
};
try{
  runtime=new Miniflare(options);
  let namespace=await runtime.getDurableObjectNamespace('BUDGET');
  const results=await Promise.all(Array.from({length:300},()=>consume(namespace)));
  assert.equal(results.filter(Boolean).length,250);
  await runtime.dispose();runtime=undefined;
  runtime=new Miniflare(options);namespace=await runtime.getDurableObjectNamespace('BUDGET');
  assert.equal(await consume(namespace),false);
  assert.equal((await runtime.dispatchFetch('http://localhost/consume')).status,404);
  console.log('PASS local workerd SQLite: exactly 250/300 concurrent reservations; exhausted counter survives restart; no public route or provider calls');
}finally{
  await runtime?.dispose();
  const target=resolve(directory),root=resolve(tmpdir());
  if(!target.startsWith(root+sep)||!target.slice(root.length+1).startsWith('apex-search-budget-'))throw new Error('Unsafe fixture cleanup');
  await rm(target,{recursive:true,force:true});
}
