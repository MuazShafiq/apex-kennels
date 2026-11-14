import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {handleWorkerRequest} from '../src/cloudflare-worker.ts';
const owner='owner@example.test',issuer='https://owner-alert-browser-test.cloudflareaccess.com';
const audience='synthetic-owner-alert-browser-audience-123';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-browser-key',alg:'RS256',use:'sig'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const data=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:issuer,aud:audience,email:owner,iat:now-1,exp:now+3600});
const token=data+'.'+sign('sha256',Buffer.from(data),privateKey).toString('base64url');

const mark=await readFile(new URL('../public/book/apex-dog-mark.svg',import.meta.url));
const id='123e4567-e89b-42d3-a456-426614174001';
const env={DATABASE_URL:'synthetic://no-database',WHATSAPP_OWNER_EMAIL:owner,STAFF_ACCESS_AUD:audience,STAFF_ACCESS_ISSUER:issuer,STAFF_ALLOWED_EMAILS:owner};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
let row={bookingId:id,state:'ambiguous',attempts:1,updatedAt:'2026-11-15T00:00:00Z',providerMessageId:null,errorKind:'ambiguous'};
let writes=0;
const deps={listOwnerAlerts:async()=>[row],loadOwnerAlert:async()=>row,reconcileOwnerAlert:async(_url,bookingId,actor,input)=>{assert.equal(bookingId,id);assert.equal(actor,owner);assert.equal(input.confirmedNotSent,true);assert.equal(input.evidence,'Synthetic Meta evidence');writes++;row={...row,state:'failed',errorKind:'failed'};},retryOwnerAlert:async(_url,bookingId,actor)=>{assert.equal(bookingId,id);assert.equal(actor,owner);writes++;row={...row,state:'queued',errorKind:null};}};
let origin;const errors=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/',origin);
    if(url.pathname==='/book/apex-dog-mark.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(mark);return;}
    const parts=[];for await(const part of req)parts.push(part);
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
    const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method??'GET')?{}:{body:Buffer.concat(parts)})});
    const response=await handleWorkerRequest(request,env,undefined,{ownerAlerts:deps});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){errors.push(error);res.writeHead(500);res.end('Synthetic test server failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:320,height:780},isMobile:true,hasTouch:true,extraHTTPHeaders:{'Cf-Access-Jwt-Assertion':token}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error));
  await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,origin);return route.continue();});
  await page.goto(origin+'/staff/owner-alerts');
  assert.equal(await page.getByRole('button',{name:'Queue retry'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Save reconciliation'}).count(),1);
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:850});
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overlap:[...document.querySelectorAll('.check')].some(el=>el.querySelector('input').getBoundingClientRect().right>el.querySelector('span').getBoundingClientRect().left)}));
    assert(layout.scroll<=layout.width+2);assert.equal(layout.overlap,false);
  }
  await page.setViewportSize({width:320,height:780});
  await page.getByLabel('Evidence reference (no personal data)').focus();
  assert(await page.getByLabel('Evidence reference (no personal data)').evaluate(el=>el===document.activeElement));
  await page.getByLabel('Meta confirms no message was sent').check();
  await page.getByLabel('Evidence reference (no personal data)').fill('Synthetic Meta evidence');
  await page.getByLabel('I checked Meta evidence and confirm this action.').check();
  await Promise.all([page.waitForURL('**/staff/owner-alerts?id=*'),page.getByRole('button',{name:'Save reconciliation'}).click()]);
  assert.equal(writes,1);assert.equal(row.state,'failed');
  await page.getByLabel('I checked Meta evidence and confirm this action.').check();
  await page.getByRole('button',{name:'Queue retry'}).click();
  await page.getByText('Waiting for the next scheduled attempt.',{exact:false}).waitFor();assert.equal(row.state,'queued');assert.equal(writes,2);
  await page.screenshot({path:'mobile-owner-alert-recovery.png',fullPage:true});
  assert.equal((await context.request.post(origin+'/staff/owner-alerts/retry',{headers:{Origin:'https://evil.test'},form:{id,confirmed:'true'}})).status(),403);
  const anon=await browser.newContext();assert.equal((await anon.request.get(origin+'/staff/owner-alerts')).status(),403);await anon.close();
  assert.deepEqual(errors,[]);
  console.log('PASS owner alert real Worker routes: 4 viewport layouts, labels/focus, reconciliation, retry, disabled sending, CSRF and anonymous denial (synthetic persistence/identity only)');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;}
