/** Browser proof over actual Worker routes, synthetic signed Access identity,
 * immutable Canva renderer, and injected in-memory persistence/provider fakes.
 * No live Access, Neon, Meta or customer calls; no production configuration.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {handleWorkerRequest} from '../src/cloudflare-worker.ts';
import {prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {makeReviewSnapshot} from '../src/staff-saved-review.ts';
import {prepareApproval,requireInvoiceOwner} from '../src/invoice-approval.ts';

const owner='owner@example.test',issuer='https://invoice-browser-test.cloudflareaccess.com';
const audience='synthetic-invoice-browser-audience-123';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-browser-key',alg:'RS256',use:'sig'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const data=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:issuer,aud:audience,email:owner,iat:now-1,exp:now+3600});
const token=data+'.'+sign('sha256',Buffer.from(data),privateKey).toString('base64url');
const template=new Uint8Array(await readFile(new URL('../public/invoice/canva-blank.pdf',import.meta.url)));
const mark=await readFile(new URL('../public/book/apex-dog-mark.svg',import.meta.url));
const bank={bank:'HBL',accountTitle:'SYNTHETIC BROWSER TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'};
const env={DATABASE_URL:'synthetic://no-database',APEX_INVOICE_APPROVAL_ENABLED:'true',APEX_INVOICE_ISSUANCE_ENABLED:'true',APEX_INVOICE_WHATSAPP_ENABLED:'true',APEX_INVOICE_OWNER_EMAIL:owner,APEX_INVOICE_BANK_JSON:JSON.stringify(bank),APEX_INVOICE_MANUAL_NUMBER_FLOOR:'0100',STAFF_ACCESS_AUD:audience,STAFF_ACCESS_ISSUER:issuer,STAFF_ALLOWED_EMAILS:owner,WHATSAPP_ACCESS_TOKEN:'synthetic-browser-token-'.repeat(3),WHATSAPP_PHONE_NUMBER_ID:'123456789012',WHATSAPP_GRAPH_VERSION:'v24.0',APEX_INVOICE_WHATSAPP_TEMPLATE:'synthetic_invoice_pdf',ASSETS:{fetch:async request=>new URL(request.url).pathname==='/invoice/canva-blank.pdf'?new Response(template,{headers:{'Content-Type':'application/pdf'}}):new Response('Not found',{status:404})}};
const originalFetch=globalThis.fetch;
let jwksRequests=0;
globalThis.fetch=async target=>{
  assert.equal(String(target),issuer+'/cdn-cgi/access/certs','Unexpected network call from Worker test');
  jwksRequests++;return Response.json({keys:[jwk]});
};
let fixture,invoice,pdf,delivery,deliveredPdf;
const effects={approvals:0,issues:0,queued:0,provider:0,retries:0,reconciliations:0};
function reset(){
  const id=randomUUID();
  // All fields are synthetic. synthetic:false deliberately exercises the
  // deliverable-record branch; persistence/provider dependencies are always fake.
  fixture={snapshot:makeReviewSnapshot(prepareStaffDraftReview({bookingId:id,customerName:'SYNTHETIC BROWSER FIXTURE',petNames:'Synthetic Browser Dog',petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:false},'daily')),revision:1,updatedBy:owner,updatedAt:new Date().toISOString()};
  invoice=null;pdf=null;delivery=null;deliveredPdf=null;
}
function queue(){
  assert.equal(invoice?.status,'issued');assert(invoice.snapshot.consent);
  if(!delivery){effects.queued++;delivery={state:'queued',attempts:0,updatedAt:new Date().toISOString(),providerMessageId:null,errorKind:null};}
}
const deps={
  loadSavedReview:async(_url,id)=>id===fixture.snapshot.booking.id?structuredClone(fixture):null,
  loadApprovedInvoice:async(_url,id)=>invoice&&[invoice.id,invoice.snapshot.review.booking.id].includes(id)?structuredClone(invoice):null,
  approveInvoice:async(_url,input,actor,config)=>{
    requireInvoiceOwner(actor,config);
    const snapshot=prepareApproval(fixture,input,actor,config);
    if(invoice)return structuredClone(invoice);
    effects.approvals++;invoice={id:randomUUID(),snapshot:structuredClone(snapshot),status:'approved'};return structuredClone(invoice);
  },
  issueInvoice:async(_url,id,actor,config,bytes)=>{
    requireInvoiceOwner(actor,config,true);assert.equal(id,invoice.id);
    if(invoice.status==='issued')return structuredClone(invoice);
    assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
    effects.issues++;pdf=new Uint8Array(bytes);
    invoice={...invoice,status:'issued',issuedAt:new Date().toISOString(),pdfSha256:createHash('sha256').update(pdf).digest('hex')};
    if(invoice.snapshot.deliveryRequested)queue();
    return structuredClone(invoice);
  },
  loadIssuedInvoicePdf:async(_url,id)=>id===invoice?.id&&pdf?new Uint8Array(pdf):null,
  loadInvoiceDelivery:async()=>delivery?structuredClone(delivery):null,
  enqueueInvoiceDelivery:async()=>queue(),
  dispatchInvoiceDelivery:async()=>{
    if(delivery?.state!=='queued')return;
    effects.provider++;deliveredPdf=new Uint8Array(pdf);
    delivery={...delivery,state:'provider_accepted',attempts:delivery.attempts+1,updatedAt:new Date().toISOString(),providerMessageId:'wamid.synthetic_browser_'+effects.provider,errorKind:null};
  },
  retryInvoiceDelivery:async()=>{
    assert.equal(delivery?.state,'failed');assert.equal(delivery.providerMessageId,null);assert(delivery.attempts<3);
    effects.retries++;delivery={...delivery,state:'queued',errorKind:null};
  },
  reconcileInvoiceDelivery:async(_url,_id,actor,input)=>{
    assert.equal(actor,owner);assert.equal(delivery?.state,'ambiguous');assert(input.evidence);
    assert.equal(input.confirmedNotSent,true);effects.reconciliations++;
    delivery={...delivery,state:'failed',errorKind:'failed',updatedAt:new Date().toISOString()};
  }
};
reset();
let origin;
const errors=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/',origin);
    if(url.pathname==='/book/apex-dog-mark.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(mark);return;}
    const parts=[];for await(const part of req)parts.push(part);
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
    const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method??'GET')?{}:{body:Buffer.concat(parts)})});
    const response=await handleWorkerRequest(request,env,undefined,{invoiceWorkflow:deps});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){errors.push(error);res.writeHead(500);res.end('Synthetic test server failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
origin='http://127.0.0.1:'+server.address().port;
let browser;
let groups=0;const pass=text=>{groups++;console.log('PASS '+text);};
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,extraHTTPHeaders:{'Cf-Access-Jwt-Assertion':token}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error));
  await page.route('**/*',route=>{
    assert(new URL(route.request().url()).origin===origin,'Browser attempted external network');return route.continue();
  });
  const goReview=()=>page.goto(origin+'/staff/invoices/review?id='+fixture.snapshot.booking.id);
  const confirm=()=>page.locator('input[name="confirmed"]').check();
  const submit=async name=>{await Promise.all([page.waitForURL('**/staff/invoices/view?id=*'),page.getByRole('button',{name,exact:true}).click()]);};
  await goReview();
  await page.getByLabel('Four-digit invoice number').focus();
  assert(await page.getByLabel('Four-digit invoice number').evaluate(el=>el===document.activeElement));
  assert(await page.getByLabel('Consenting WhatsApp number').count()===1);
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overlap:[...document.querySelectorAll('.check')].some(el=>el.querySelector('input').getBoundingClientRect().right>el.querySelector('span').getBoundingClientRect().left)}));
  assert(layout.scroll<=layout.width+2);assert.equal(layout.overlap,false);
  await page.getByLabel('Four-digit invoice number').fill('0101');
  await page.getByLabel('Consenting WhatsApp number').fill('03000000000');
  await page.getByLabel('Consent time (UTC ISO timestamp)').fill(new Date().toISOString());
  await page.getByLabel('Consent evidence reference',{exact:true}).fill('Synthetic browser invoice PDF opt-in reference');
  await confirm();await submit('Approve, issue & send');
  assert.equal(invoice.snapshot.deliveryRequested,true);assert.equal(invoice.status,'issued');
  assert.equal(delivery.state,'provider_accepted');assert.equal(effects.approvals,1);assert.equal(effects.issues,1);assert.equal(effects.queued,1);assert.equal(effects.provider,1);
  assert.equal(await page.getByText('Invoice status: issued. Delivery: provider_accepted.',{exact:true}).count(),1);
  await page.screenshot({path:'mobile-invoice-e2e.png',fullPage:true});
  pass('390px owner flow: labels/focus/alignment and single approve, issue & send action');

  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download issued PDF'}).click();
  const downloaded=await downloadPromise;const bytes=new Uint8Array(await readFile(await downloaded.path()));
  assert.deepEqual(bytes,pdf);assert.deepEqual(bytes,deliveredPdf);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),invoice.pdfSha256);
  pass('browser download and fake provider use identical immutable Canva PDF bytes');

  const post=async action=>context.request.post(origin+'/staff/invoices/'+action,{headers:{Origin:origin},form:{id:invoice.id,confirmed:'true'},maxRedirects:0});
  for(const action of ['issue','send','send'])assert.equal((await post(action)).status(),303);
  assert.equal(effects.issues,1);assert.equal(effects.queued,1);assert.equal(effects.provider,1);
  pass('duplicate issue/send POSTs preserve one PDF and one provider action');

  // Simulate interruption AFTER approval but BEFORE issuance, then exercise
  // the actual recovery form against the frozen intent and recorded consent.
  reset();const recoveryInput={bookingId:fixture.snapshot.booking.id,revision:1,invoiceNumber:'0102',confirmed:true,transportVerified:false,fuelVerified:false,deliveryRequested:true,consent:{phone:'03000000000',purpose:'invoice_pdf',consentedAt:new Date().toISOString(),evidence:'Synthetic recovery consent'}};
  await deps.approveInvoice(env.DATABASE_URL,recoveryInput,owner,{enabled:'true',issuanceEnabled:'true',deliveryEnabled:'true',ownerEmail:owner,bankDetailsJson:JSON.stringify(bank),manualNumberFloor:'0100'});
  await page.goto(origin+'/staff/invoices/view?id='+invoice.id);
  assert.equal(await page.getByRole('button',{name:'Continue approved delivery'}).count(),1);
  await confirm();await submit('Continue approved delivery');
  assert.equal(invoice.status,'issued');assert.equal(delivery.state,'provider_accepted');
  pass('interrupted combined approval resumes through Continue approved delivery');

  delivery={state:'failed',attempts:1,updatedAt:new Date().toISOString(),providerMessageId:null,errorKind:'failed'};
  await page.reload();assert.equal(await page.getByRole('button',{name:'Retry failed delivery'}).count(),1);
  const beforeRetry=effects.provider;await confirm();await submit('Retry failed delivery');
  assert.equal(effects.retries,1);assert.equal(effects.provider,beforeRetry+1);assert.equal(delivery.state,'provider_accepted');
  delivery={state:'ambiguous',attempts:2,updatedAt:new Date().toISOString(),providerMessageId:null,errorKind:'ambiguous'};
  await page.reload();assert.equal(await page.getByRole('button',{name:'Retry failed delivery'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Save reconciliation'}).count(),1);
  await page.getByLabel('Meta evidence confirms that no customer message was sent.').check();
  await page.getByLabel('Reconciliation evidence reference').fill('Synthetic provider lookup reference');
  const beforeRepair=effects.provider;await confirm();await submit('Save reconciliation');
  assert.equal(delivery.state,'failed');assert.equal(effects.reconciliations,1);assert.equal(effects.provider,beforeRepair);
  pass('failed retry and ambiguous reconciliation are distinct; reconciliation never sends');

  const beforeDisabled={...effects};
  env.APEX_INVOICE_WHATSAPP_ENABLED='false';assert.equal((await post('send')).status(),503);
  env.APEX_INVOICE_ISSUANCE_ENABLED='false';assert.equal((await post('issue')).status(),503);
  env.APEX_INVOICE_APPROVAL_ENABLED='false';assert.equal((await post('send')).status(),503);
  assert.deepEqual(effects,beforeDisabled);
  assert.equal(errors.length,0);assert(jwksRequests>0);
  pass('all disabled flags return 503 without persistence/provider effects');
  await context.close();console.log('PASS '+groups+' invoice browser groups; synthetic memory/provider fakes only');
}finally{
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;
}
