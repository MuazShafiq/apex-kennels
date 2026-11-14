import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';
import {invoiceStaffRoute,invoiceWebhookRoute,type InvoiceWorkflowDeps} from './invoice-workflow-routes.ts';
import {renderInvoiceApprovalPage} from './staff-invoice-approval.ts';
import {makeReviewSnapshot,type SavedReview} from './staff-saved-review.ts';
import {prepareStaffDraftReview} from './staff-invoice-draft.ts';
import {prepareApproval,type ApprovedInvoice} from './invoice-approval.ts';

const owner='owner@example.test',id='123e4567-e89b-42d3-a456-426614174001';
const origin='https://example.test';
const bank={bank:'HBL',accountTitle:'SYNTHETIC TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'};
const env:WorkerEnv={DATABASE_URL:'synthetic://no-database',APEX_INVOICE_APPROVAL_ENABLED:'true',APEX_INVOICE_OWNER_EMAIL:owner,APEX_INVOICE_BANK_JSON:JSON.stringify(bank),APEX_INVOICE_MANUAL_NUMBER_FLOOR:'0100',STAFF_ACCESS_AUD:'synthetic-invoice-audience-123',STAFF_ACCESS_ISSUER:'https://invoice-test.cloudflareaccess.com',STAFF_ALLOWED_EMAILS:owner+',staff@example.test'};
function saved():SavedReview{return {snapshot:makeReviewSnapshot(prepareStaffDraftReview({bookingId:id,customerName:'SYNTHETIC TEST ONLY',petNames:'Synthetic Dog',petCount:1,startDate:'2026-11-15',endDate:'2026-11-17',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:false},'daily')),revision:1,updatedBy:owner,updatedAt:new Date().toISOString()};}
function invoice():ApprovedInvoice{return {id,snapshot:prepareApproval(saved(),{bookingId:id,revision:1,invoiceNumber:'0101',confirmed:true,transportVerified:false,fuelVerified:false,consent:{phone:'03000000000',purpose:'invoice_pdf',consentedAt:new Date().toISOString(),evidence:'Synthetic consent only'}},owner,{enabled:'true',ownerEmail:owner,bankDetailsJson:JSON.stringify(bank),manualNumberFloor:'0100'}),status:'approved'};}
function req(action:string,fields?:Record<string,string>):Request{return new Request(origin+'/staff/invoices/'+action+(fields?'':'?id='+id),fields?{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id,confirmed:'true',...fields})}:undefined);}
const context=(email=owner)=>({access:{aud:env.STAFF_ACCESS_AUD!,getIdentity:async()=>({email})}});

test('invoice endpoints default closed and never trust unsigned owner headers or ordinary staff',async()=>{
  for(const action of ['review','view','pdf','preview.pdf','approve','issue','send','retry','reconcile']){
    const request=req(action,['review','view','pdf','preview.pdf'].includes(action)?undefined:{});
    assert.equal((await handleWorkerRequest(request,{})).status,503);
  }
  assert.equal((await handleWorkerRequest(req('review'),env)).status,403);
  assert.equal((await handleWorkerRequest(req('review'),env,undefined,{context:context('staff@example.test')})).status,403);
  assert.equal((await handleWorkerRequest(req('approve',{revision:'1',invoiceNumber:'0101'}),env,undefined,{context:context()})).status,403);
});

test('fresh signed Access identity required for mutations even when ctx.access is present',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'invoice-test',alg:'RS256',use:'sig'};
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(String(url),env.STAFF_ACCESS_ISSUER+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  const token=(overrides:Record<string,unknown>)=>{
    const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
    const now=Math.floor(Date.now()/1000);
    const payload=encode({alg:'RS256',kid:'invoice-test'})+'.'+encode({iss:env.STAFF_ACCESS_ISSUER,aud:env.STAFF_ACCESS_AUD,email:owner,iat:now-1,exp:now+3600,...overrides});
    return payload+'.'+sign('sha256',Buffer.from(payload),privateKey).toString('base64url');
  };
  let approvals=0;
  try{
    for(const overrides of [{iat:Math.floor(Date.now()/1000)-301},{iat:undefined},{email:'staff@example.test'},{aud:'wrong-audience'},{}]){
      const request=req('approve',{revision:'1',invoiceNumber:'0101'});request.headers.set('Cf-Access-Jwt-Assertion',token(overrides));
      const result=await handleWorkerRequest(request,env,undefined,{context:context(),invoiceWorkflow:{approveInvoice:async(_url,input,actor)=>{assert.equal(actor,owner);assert.equal(input.revision,1);approvals++;return invoice();}}});
      assert.equal(result.status,Object.keys(overrides).length?403:303);
    }
    assert.equal(approvals,1);
  }finally{globalThis.fetch=oldFetch;}
});

test('mutation validates same origin, exact fields, confirmations, bounded body and owner before persistence',async()=>{
  let writes=0;
  const deps:InvoiceWorkflowDeps={approveInvoice:async()=>{writes++;return invoice();}};
  const cross=req('approve',{revision:'1',invoiceNumber:'0101'});cross.headers.set('Origin','https://attacker.test');
  assert.equal((await invoiceStaffRoute(cross,env,owner,deps)).status,403);
  assert.equal((await invoiceStaffRoute(req('approve',{revision:'1',invoiceNumber:'0101'}),env,'staff@example.test',deps)).status,403);
  const invalidFields:Record<string,string>[]=[{email:owner},{confirmed:'false'},{revision:'1e3'},{revision:'1',invoiceNumber:'0101',extra:'x'}];
  for(const fields of invalidFields)assert.equal((await invoiceStaffRoute(req('approve',fields),env,owner,deps)).status,400);
  const huge=req('approve',{evidence:'x'.repeat(5000)});assert.equal((await invoiceStaffRoute(huge,env,owner,deps)).status,413);
  const duplicate=new Request(origin+'/staff/invoices/approve',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'id='+id+'&id='+id+'&confirmed=true'});
  assert.equal((await invoiceStaffRoute(duplicate,env,owner,deps)).status,400);
  assert.equal(writes,0);
});

test('issuance and send gates remain independent; issued PDF downloads use stored bytes',async()=>{
  let effects=0;
  const deps:InvoiceWorkflowDeps={loadApprovedInvoice:async()=>invoice(),enqueueInvoiceDelivery:async()=>{effects++;},dispatchInvoiceDelivery:async()=>{effects++;},loadIssuedInvoicePdf:async()=>new TextEncoder().encode('%PDF-synthetic-stored-artifact')};
  assert.equal((await invoiceStaffRoute(req('issue',{}),env,owner,deps)).status,503);
  assert.equal((await invoiceStaffRoute(req('send',{}),env,owner,deps)).status,503);
  assert.equal(effects,0);
  const pdf=await invoiceStaffRoute(req('pdf'),env,owner,deps);
  assert.equal(pdf.status,200);assert.equal(await pdf.text(),'%PDF-synthetic-stored-artifact');
  assert.match(pdf.headers.get('cache-control')??'',/no-store/);
});

test('frozen preview uses approved snapshot, while queued dispatch and manual reconciliation are explicit',async()=>{
  const approved=invoice();let queued=0,dispatched=0,reconciled=0;
  const deps:InvoiceWorkflowDeps={loadApprovedInvoice:async()=>approved,loadInvoiceDelivery:async()=>null,enqueueInvoiceDelivery:async()=>{queued++;},dispatchInvoiceDelivery:async()=>{dispatched++;},reconcileInvoiceDelivery:async(_url,ref,actor,input)=>{assert.equal(ref,id);assert.equal(actor,owner);assert.equal(input.confirmedNotSent,true);reconciled++;}};
  const pdf=await invoiceStaffRoute(req('preview.pdf'),{...env,ASSETS:{fetch:async()=>new Response(readFileSync(new URL('../public/invoice/canva-blank.pdf',import.meta.url))) }},owner,deps);
  assert.equal(pdf.status,200);assert.match((await pdf.text()).slice(0,5),/%PDF-/);
  const send=await invoiceStaffRoute(req('send',{}),{...env,APEX_INVOICE_WHATSAPP_ENABLED:'true'},owner,deps);
  assert.equal(send.status,303);assert.equal(queued,1);assert.equal(dispatched,1);
  const repair=await invoiceStaffRoute(req('reconcile',{confirmedNotSent:'true',evidence:'Synthetic Meta evidence reference'}),env,owner,deps);
  assert.equal(repair.status,303);assert.equal(reconciled,1);assert.equal(dispatched,1);
});

test('webhook verifies exact raw signature, bounded body and sender before persisting events',async()=>{
  const secret='synthetic-app-secret-only-123';
  const webhookEnv={...env,APEX_INVOICE_WEBHOOK_SECRET:secret,WHATSAPP_PHONE_NUMBER_ID:'123456789012',APEX_INVOICE_WEBHOOK_VERIFY_TOKEN:'synthetic-verify-token'};
  let persisted=0;
  const body=JSON.stringify({object:'whatsapp_business_account',entry:[]});
  const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
  const make=(sig:string|null,payload=body)=>new Request(origin+'/api/invoice-delivery/webhook',{method:'POST',headers:sig?{'x-hub-signature-256':sig}:{},body:payload});
  const deps:InvoiceWorkflowDeps={applyInvoiceWebhook:async(_url,events)=>{assert.deepEqual(events,[]);persisted++;}};
  assert.equal((await invoiceWebhookRoute(make(null),webhookEnv,deps)).status,403);
  assert.equal((await invoiceWebhookRoute(make(signature,' '+body),webhookEnv,deps)).status,403);
  assert.equal((await invoiceWebhookRoute(make(signature),webhookEnv,deps)).status,200);
  assert.equal((await invoiceWebhookRoute(make(signature,'x'.repeat(262145)),webhookEnv,deps)).status,413);
  assert.equal(persisted,1);
  const challenge=await invoiceWebhookRoute(new Request(origin+'/api/invoice-delivery/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=123456'),webhookEnv,deps);
  assert.equal(challenge.status,200);assert.equal(await challenge.text(),'123456');
  assert.equal((await invoiceWebhookRoute(make(signature),webhookEnv,{applyInvoiceWebhook:async()=>{throw new Error('synthetic DB unavailable');}})).status,503);
});

test('one confirmed approval runs issue and dispatch; interrupted approved intent can resume',async()=>{
  const allEnabled={...env,APEX_INVOICE_ISSUANCE_ENABLED:'true',APEX_INVOICE_WHATSAPP_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'synthetic-token-'.repeat(4),WHATSAPP_PHONE_NUMBER_ID:'123456789012',WHATSAPP_GRAPH_VERSION:'v24.0',APEX_INVOICE_WHATSAPP_TEMPLATE:'synthetic_invoice_pdf',ASSETS:{fetch:async()=>new Response(readFileSync(new URL('../public/invoice/canva-blank.pdf',import.meta.url)))}};
  const approved=invoice();approved.snapshot.deliveryRequested=true;
  const calls:string[]=[];
  const deps:InvoiceWorkflowDeps={approveInvoice:async(_url,input,actor,config)=>{assert.equal(input.deliveryRequested,true);assert.equal(actor,owner);assert.equal(config.deliveryEnabled,'true');calls.push('approve');return approved;},loadApprovedInvoice:async()=>approved,issueInvoice:async(_url,ref,_actor,_config,pdf)=>{assert.equal(ref,id);assert.equal(new TextDecoder().decode(pdf.slice(0,5)),'%PDF-');calls.push('issue');return {...approved,status:'issued'};},dispatchInvoiceDelivery:async()=>{calls.push('dispatch');}};
  const result=await invoiceStaffRoute(req('approve',{intent:'issue_and_send',revision:'1',invoiceNumber:'0101',phone:'03000000000',consentedAt:new Date().toISOString(),evidence:'Synthetic explicit invoice PDF consent'}),allEnabled,owner,deps);
  assert.equal(result.status,303);assert.deepEqual(calls,['approve','issue','dispatch']);
  calls.length=0;
  const failed=await invoiceStaffRoute(req('issue',{}),allEnabled,owner,{...deps,issueInvoice:async()=>{throw new Error('Synthetic database interruption');}});
  assert.equal(failed.status,500);assert.deepEqual(calls,[]);
  const recovered=await invoiceStaffRoute(req('issue',{}),allEnabled,owner,deps);
  assert.equal(recovered.status,303);assert.deepEqual(calls,['issue','dispatch']);
  calls.length=0;
  assert.equal((await invoiceStaffRoute(req('issue',{}),{...allEnabled,APEX_INVOICE_WHATSAPP_ENABLED:'false'},owner,deps)).status,503);
  assert.deepEqual(calls,[]);
  const html=renderInvoiceApprovalPage({invoice:approved,approvalEnabled:true,issuanceEnabled:true,sendEnabled:false});
  assert.doesNotMatch(html,/Continue approved delivery/);assert.match(html,/delivery intent is saved/);
});

test('owner page escapes content, shows frozen evidence, and exposes only safe recovery actions',()=>{
  const item=invoice();item.snapshot.review.booking.customerName='<script>private</script>';
  const base={invoice:{...item,status:'issued' as const},approvalEnabled:true,issuanceEnabled:true,sendEnabled:true};
  const status=(state:'queued'|'sending'|'failed'|'ambiguous'|'provider_accepted'|'delivered',providerMessageId:string|null=null,attempts=1)=>({...base,delivery:{state,attempts,updatedAt:new Date().toISOString(),providerMessageId,errorKind:null}});
  const queued=renderInvoiceApprovalPage(status('queued'));
  assert.match(queued,/Resume queued delivery/);assert.doesNotMatch(queued,/<script>/);
  assert.match(queued,/preview\.pdf/);assert.doesNotMatch(queued,/draft\/saved\.pdf/);
  assert.match(renderInvoiceApprovalPage(status('ambiguous')),/Save reconciliation/);
  assert.match(renderInvoiceApprovalPage(status('failed')),/Retry failed delivery/);
  assert.doesNotMatch(renderInvoiceApprovalPage(status('failed','wamid.synthetic_123456')),/Retry failed delivery/);
  assert.doesNotMatch(renderInvoiceApprovalPage(status('failed',null,3)),/Retry failed delivery/);
  assert.doesNotMatch(renderInvoiceApprovalPage(status('delivered')),/Send approved invoice|Retry failed delivery|Save reconciliation/);
  delete base.invoice.snapshot.consent;
  assert.match(renderInvoiceApprovalPage(base),/No invoice PDF WhatsApp consent/);
  assert.doesNotMatch(renderInvoiceApprovalPage(base),/Send approved invoice/);
});
