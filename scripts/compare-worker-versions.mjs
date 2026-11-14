#!/usr/bin/env node
/**
 * Read-only comparison of the two unexplained Apex Wrangler deployments.
 * Requires the same local Wrangler login that supports "wrangler versions list".
 * No Worker writes, deployment, token inspection, booking submission, or DB reads.
 *
 * Run: node scripts/compare-worker-versions.mjs
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const worker='apex-kennels-api';
const subdomain='muaz-shafiq18.workers.dev';
const versions=[
  {tag:'petrol fix',id:'a63c43e0-16ae-4a64-ac37-8cde0ff81eb3'},
  {tag:'unlabelled #116',id:'d15f696d-63c0-4a22-8f33-d9030a652651'},
  {tag:'PDF fix',id:'b66a4725-877e-440a-af40-e32a41b877d9'},
  {tag:'unlabelled #118',id:'9f8a2240-6080-4b2b-b312-b10d8136c30c'}
];
const paths=['/api/health','/api/book/config','/book','/book/app.js','/book/styles.css','/demo/invoice'];
const digest=(v)=>createHash('sha256').update(v).digest('hex').slice(0,16);
const canon=(v)=>{
  if(Array.isArray(v))return v.map(canon);
  if(v && typeof v==='object'){
    return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,value])=>[k,canon(value)]));
  }
  return v;
};
const fingerprint=(obj)=>obj===undefined?'UNKNOWN':digest(JSON.stringify(canon(obj)));
const redactedBindings=(r)=>{
  const raw=r?.resources?.bindings;
  if(raw==null)return null;
  const list=Array.isArray(raw)?raw:Object.entries(raw).map(([name,v])=>({name,...v}));
  return list.map(b=>({name:b.name??'unnamed',type:b.type??'unknown'}))
    .sort((a,b)=>(a.name+':'+a.type).localeCompare(b.name+':'+b.type));
};
function viewVersion(version){
  // npx uses the already installed Wrangler. No package download or auth changes.
  const executable=process.platform==='win32'?'npx.cmd':'npx';
  const run=spawnSync(executable,
    ['--no-install','wrangler','versions','view',version.id,'--name',worker,'--json'],
    {encoding:'utf8',shell:process.platform==='win32',windowsHide:true,
      timeout:45000,maxBuffer:6*1024*1024});
  if(run.error||run.status!==0){
    // Do not echo stderr: Cloudflare authentication errors can contain
    // environment details that do not belong in audit reports.
    return {error:'Wrangler version read failed (exit '+run.status+'). Check local login.'};
  }
  let value;
  try{
    const stdout=run.stdout.trim();
    // JSON output should start with "{", but tolerate innocuous CLI prefixes.
    const start=stdout.indexOf('{');
    if(start<0)throw new Error('Missing JSON');
    value=JSON.parse(stdout.slice(start));
    value=value.result??value;
  }catch{return {error:'Wrangler did not return parseable version JSON'};}
  return {
    etag:value.resources?.script?.etag??null,
    runtime:fingerprint(value.resources?.script_runtime),
    bindings:redactedBindings(value),
    assets:fingerprint(value.assets?.config??value.resources?.assets),
    version:value.id??version.id
  };
}
async function getPublicVersion(tag,version){
  const host=version.id.slice(0,8)+'-'+worker+'.'+subdomain;
  return Promise.all(paths.map(async path=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('https://'+host+path,{
        method:'GET',redirect:'manual',signal:controller.signal,
        headers:{'Cache-Control':'no-cache'}
      });
      if(response.status!==200)
        return {path,status:response.status,hash:null,note:'Not a successful response'};
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>6_000_000)return {path,status:200,hash:null,note:'Oversized'};
      return {path,status:200,hash:digest(bytes),bytes:bytes.length};
    }catch{return {path,status:'unavailable',hash:null,note:'Preview request failed'};}
    finally{clearTimeout(timer);}
  })).then(rows=>({tag,rows}));
}
function reportPair(a,b,pa,pb){
  console.log('\n'+a.tag+' -> '+b.tag);
  if(a.view.error||b.view.error){
    console.log('Version metadata: UNKNOWN:',a.view.error??b.view.error);
  }else{
    for(const [key,label] of [
      ['etag','Script content ETag'],
      ['runtime','Runtime configuration'],
      ['assets','Asset configuration']
    ]){
      const v1=a.view[key],v2=b.view[key];
      console.log(label+': '+(v1==null||v2==null||v1==='UNKNOWN'||v2==='UNKNOWN'
        ?'UNKNOWN':v1===v2?'SAME':'DIFFERENT')+
        (key==='etag'?' ('+(v1??'missing')+' / '+(v2??'missing')+')':''));
    }
    const bindingsA=a.view.bindings,bindingsB=b.view.bindings;
    const key=bindingsA===null||bindingsB===null?'UNKNOWN':
      JSON.stringify(bindingsA)===JSON.stringify(bindingsB)?'SAME':'DIFFERENT';
    console.log('Binding names/types: '+key+' (binding values and secrets NOT compared)');
    if(key==='DIFFERENT'){
      const left=new Set(bindingsA.map(x=>x.name+':'+x.type));
      const right=new Set(bindingsB.map(x=>x.name+':'+x.type));
      console.log('  Removed: '+[...left].filter(x=>!right.has(x)).join(', '));
      console.log('  Added: '+[...right].filter(x=>!left.has(x)).join(', '));
    }
  }
  console.log('Public version previews (read-only GET, no staff data):');
  for(const path of paths){
    const x=pa.rows.find(v=>v.path===path),y=pb.rows.find(v=>v.path===path);
    const comparison=x.hash&&y.hash?'SHA '+(x.hash===y.hash?'SAME':'DIFFERENT'):
      'UNKNOWN (version URL unavailable or request failed)';
    console.log('  '+path+': '+comparison+'; HTTP '+x.status+'/'+y.status);
  }
}
console.log('Apex Worker version comparison (READ ONLY; no deployment or mutations)');
console.log('Cloudflare Worker version URLs use production bindings: public GET only.');
const resolved=versions.map(v=>({...v,view:viewVersion(v)}));
const previews=await Promise.all(resolved.map(x=>getPublicVersion(x.tag,x)));
reportPair(resolved[0],resolved[1],previews[0],previews[1]);
reportPair(resolved[2],resolved[3],previews[2],previews[3]);

// A bounded, read-only check of the currently active public booking gate.
try{
  const base='https://'+worker+'.'+subdomain;
  const response=await fetch(base+'/api/book/config',{signal:AbortSignal.timeout(12000)});
  const config=response.ok?await response.json():{};
  console.log('\nCurrent production /api/book/config: HTTP '+response.status+
    ', gate '+(config.enabled===false?'CLOSED':config.enabled===true?'OPEN':'UNKNOWN'));
}catch{console.log('\nCurrent production booking gate: UNKNOWN (request failed)');}
console.log('\nInterpretation: matching hashes show matching observed content only.');
console.log('ETags cover Worker script code, not storage state. Dynamic responses may vary.');
console.log('Failed version previews or omitted binding values are UNKNOWN, never proof of equality.');
