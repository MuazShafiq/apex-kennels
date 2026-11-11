/**
 * Pre-launch synthetic browser -> Worker smoke. No Neon, customer contacts,
 * Cloudflare credentials or production write endpoints are used.
 * Keeps the real public submission flag disabled in production.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {handleWorkerRequest} from '../src/cloudflare-worker.ts';

const site='http://127.0.0.1';
const env={
  APEX_PUBLIC_BOOKING_ENABLED:'true',
  DATABASE_URL:'postgres://synthetic.invalid/no-writes',
  TURNSTILE_SITE_KEY:'ci-synthetic-sitekey',
  TURNSTILE_SECRET_KEY:'ci-synthetic-secret'
};
const saved=[];
let challengeChecks=0;
const persist=async(db,booking)=>{
  assert.equal(db,env.DATABASE_URL);
  assert.equal(booking.source,'website');
  assert(booking.customerName.startsWith('APEX CANARY'));
  assert(booking.petName.startsWith('APEX SYNTHETIC CANARY'));
  saved.push(booking);
  return {bookingId:'a123e456-789b-4123-a456-426614174001',
    created:true,status:'requested'};
};
const verifyChallenge=async(token,secret,hostname)=>{
  challengeChecks++;
  assert.equal(token,'ci-synthetic-token');
  assert.equal(secret,env.TURNSTILE_SECRET_KEY);
  assert.equal(hostname,'127.0.0.1');
  return true;
};
let port;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/',site).pathname;
  if(path.startsWith('/api/')){
    const bytes=[];
    for await(const chunk of req)bytes.push(chunk);
    const request=new Request(site+':'+port+(req.url??'/'),{
      method:req.method,headers:{
        Origin:req.headers.origin??site+':'+port,
        'Content-Type':req.headers['content-type']??'application/json'
      },
      ...(req.method==='POST'?{body:Buffer.concat(bytes)}:{})
    });
    const answer=await handleWorkerRequest(request,env,persist,{verifyChallenge});
    res.writeHead(answer.status,Object.fromEntries(answer.headers.entries()));
    res.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  const file=path==='/book'||path==='/book/'?'index.html':path.startsWith('/book/')?path.slice(6):null;
  if(!file||file.includes('..')||file.includes('/')&&file.split('/').some(p=>p==='..')){
    res.writeHead(404);res.end();return;
  }
  const root=resolve(process.cwd(),'public','book');
  const dest=resolve(root,file);
  if(dest!==root&&!dest.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  try{
    const data=await readFile(dest);
    const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':
      file.endsWith('.svg')?'image/svg+xml':'text/html';
    res.writeHead(200,{'Content-Type':type});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
port=server.address().port;
const origin=site+':'+port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const choice=async(page,name,value)=>{
  await page.locator('label.option:has(input[name="'+name+'"][value="'+value+'"]) > span').click();
};
const fill=async page=>{
  await page.locator('[name="customerName"]').fill('APEX CANARY BROWSER TEST');
  await page.locator('[name="phone"]').fill('03000000000');
  await page.locator('[name="ownerAddress"]').fill('Synthetic gate, not a customer address');
  await page.locator('[name="startDate"]').fill('2026-12-10');
  await page.locator('[name="endDate"]').fill('2026-12-12');
  await page.locator('[name="emergencyContactPhone"]').fill('03000000001');
  await page.locator('[name="petName"]').fill('APEX SYNTHETIC CANARY DOG');
  await page.locator('[name="breed"]').fill('Synthetic mixed breed');
  await page.locator('[name="gender"]').fill('Female');
  await page.locator('[name="age"]').fill('2 years');
  await page.locator('[name="vaccinationStatus"]').selectOption('Fully vaccinated and booster is up to date');
  await choice(page,'distemperHistory','No');
  await choice(page,'cameraCageRequested','no');
  for(const key of ['friendly','fears','climber','foodSensitivities',
    'barksExcessively','allergies','biteHistory','medicalConditions'])
    await choice(page,'trait_'+key,'No');
  await page.locator('[name="termsAccepted"]').check();
};
const newPage=async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.addInitScript(()=>{
    // This is an isolated CI stub. No real Turnstile bypass is deployed.
    window.turnstile={
      render(_target,opts){
        if(opts.action!=='apex-booking')throw Error('Wrong Turnstile action');
        queueMicrotask(()=>opts.callback('ci-synthetic-token'));
        return 1;
      },
      reset(){}
    };
  });
  await page.route('https://challenges.cloudflare.com/**',route=>
    route.fulfill({status:200,contentType:'application/javascript',body:'// CI stub only'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/book',{waitUntil:'domcontentloaded'});
  await page.locator('#preview').waitFor({state:'hidden'});
  await page.locator('#submit').waitFor({state:'visible'});
  assert.equal(await page.locator('#submit').isEnabled(),true);
  return {page,errors};
};
try{
  const first=await newPage();
  await fill(first.page);
  await choice(first.page,'transportChoice','both');
  await first.page.locator('#submit').click();
  await first.page.locator('#message').waitFor({state:'visible'});
  assert.match(await first.page.locator('#message').innerText(),/location/i);
  assert.equal(saved.length,0,'No verified pickup pin must not write anything');

  await first.page.locator('#maps-link').fill('33.700000, 73.080000');
  await first.page.locator('#selected-location-link').waitFor({state:'visible'});
  await first.page.locator('[name="whatsappInvoiceOptIn"]').check();
  await first.page.locator('#submit').click();
  await first.page.locator('#complete').waitFor({state:'visible'});
  assert.match(await first.page.locator('#reference').innerText(),/a123e456/);
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].transportLocation,{
    latitude:33.7,longitude:73.08,service:'both',customerConfirmed:true});
  assert.equal(saved[0].details.whatsappInvoiceOptIn,true);
  assert.equal(Object.keys(saved[0].details.personalityTraits).length,8);
  assert.deepEqual(first.errors,[]);
  await first.page.close();

  const second=await newPage();
  await fill(second.page);
  await choice(second.page,'transportChoice','none');
  await second.page.locator('#submit').click();
  await second.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,2);
  assert.equal(saved[1].transportLocation,undefined);
  assert.equal(saved[1].details.pickupDropoffRequested,false);
  assert.deepEqual(second.errors,[]);
  await second.page.close();
  assert.equal(challengeChecks,2);
  console.log('Synthetic end-to-end booking passed: browser form, exact pin, optional WhatsApp opt-in, full care details, Turnstile verification gate, no-transport request. No real writes/messages.');
} finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
