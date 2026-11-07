import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkerRequest,type WorkerEnv,type StaffContext} from './cloudflare-worker.ts';
import {prepareStaffDraftReview,type StaffInvoiceSource} from './staff-invoice-draft.ts';
import {makeReviewSnapshot,validateSnapshot,renderSavedReview,DraftSaveError,type ReviewSnapshot} from './staff-saved-review.ts';

const origin='https://example.workers.dev';
const bookingId='123e4567-e89b-42d3-a456-426614174001';
const booking:StaffInvoiceSource={
  bookingId,customerName:'Sample Customer',petNames:'Rex',
  petCount:1,startDate:'2026-11-01',endDate:'2026-11-30',
  status:'requested',cameraCageRequested:true,transportRequested:false,
  synthetic:false
};
const env:WorkerEnv={
  DATABASE_URL:'postgresql://synthetic.invalid/no-connection',
  STAFF_ACCESS_AUD:'test-app-audience',
  STAFF_ALLOWED_EMAILS:'owner@example.test',
  APEX_STAFF_DRAFTS_ENABLED:'true'
};
const context:StaffContext={access:{
  aud:'test-app-audience',getIdentity:async()=>({email:'owner@example.test'})
}};
const newReview=()=>makeReviewSnapshot(prepareStaffDraftReview(booking,'auto'));
const form=(fields:Record<string,string>,from=origin)=>new Request(origin+'/staff/draft/save',{
  method:'POST',headers:{Origin:from,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(fields).toString()
});
const fields={id:bookingId,package:'monthly',revision:'0'};

test('saved draft freezes a real 30-day camera package with explicit discount',()=>{
  const snapshot=newReview();
  assert.equal(snapshot.version,1);
  assert.equal(snapshot.packageChoice,'monthly');
  assert.equal(snapshot.quote.subtotalPkr,90000);
  assert.equal(snapshot.quote.discounts[0]?.amountPkr,10000);
  assert.equal(snapshot.quote.totalPkr,80000);
  assert.equal(snapshot.booking.customerName,'Sample Customer');
  assert.equal(validateSnapshot(snapshot).booking.id,bookingId);
  const page=renderSavedReview({
    snapshot,revision:1,updatedBy:'owner@example.test',updatedAt:'2026-11-07'
  });
  assert.match(page,/INTERNAL PREVIEW · NOT FOR CUSTOMER DELIVERY/);
  assert.match(page,/30-day boarding discount/);
  assert.match(page,/PKR 80,000/);
  assert.doesNotMatch(page,/Payment details|IBAN|Send invoice|Approved invoice/);
});

test('synthetic records, transport pricing and cancelled bookings cannot be saved',()=>{
  for(const modified of [
    {...booking,synthetic:true},
    {...booking,transportRequested:true},
    {...booking,transportRequested:null},
    {...booking,cameraCageRequested:null},
    {...booking,status:'cancelled'}
  ]){
    assert.throws(
      ()=>makeReviewSnapshot(prepareStaffDraftReview(modified,'auto')),DraftSaveError);
  }
  assert.throws(()=>validateSnapshot({version:1,booking:{id:'bad'},quote:{lines:[],discounts:[]}}));
});

test('saving is disabled by default and unauthorized identities never touch booking database',async()=>{
  let calls=0;
  const opts={context,draft:async()=>{
    calls++;return booking;
  },saveReview:async()=>{calls++;return {revision:1};}};
  const disabled=await handleWorkerRequest(form(fields),{...env,APEX_STAFF_DRAFTS_ENABLED:'false'},
    undefined,opts);
  assert.equal(disabled.status,503);
  const forbidden=await handleWorkerRequest(form(fields),env,undefined,{
    ...opts,context:undefined
  });
  assert.equal(forbidden.status,403);
  assert.equal(calls,0);
});

test('cross-origin POST, malformed body and duplicate form keys never save',async()=>{
  let saves=0;
  const opts={context,draft:async()=>booking,saveReview:async()=>{saves++;return {revision:1};}};
  for(const request of [
    form(fields,'https://attacker.example.test'),
    new Request(origin+'/staff/draft/save',{method:'POST',headers:{
      'Content-Type':'application/x-www-form-urlencoded'
    },body:new URLSearchParams(fields).toString()}),
    form({...fields,revision:'-1'}),
    form({...fields,revision:'evil'}),
    form({...fields,id:'not-uuid'}),
    form({...fields,package:'free'}),
    form({...fields,unexpected:'yes'}),
    new Request(origin+'/staff/draft/save',{method:'POST',headers:{
      Origin:origin,'Content-Type':'application/x-www-form-urlencoded'
    },body:'id='+bookingId+'&package=monthly&revision=0&revision=0'})
  ]){
    const response=await handleWorkerRequest(request,env,undefined,opts);
    assert.ok(response.status>=400,'expected failure, got '+response.status);
  }
  assert.equal(saves,0);
});

test('authenticated staff save creates an internal revision then redirects to saved review',async()=>{
  let writes=0;
  const response=await handleWorkerRequest(form(fields),env,undefined,{
    context,draft:async(_url,id)=>{
      assert.equal(id,bookingId);return booking;
    },
    saveReview:async(_url,snapshot,expectedRevision,email)=>{
      writes++;
      assert.equal(expectedRevision,0);
      assert.equal(email,'owner@example.test');
      assert.equal(snapshot.quote.totalPkr,80000);
      return {revision:1};
    }
  });
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/staff/draft/saved?id='+bookingId);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(writes,1);
});

test('saved route is staff-only, read-only and renders frozen numbers',async()=>{
  let reads=0;
  const snapshot:ReviewSnapshot=newReview();
  const saved={snapshot,revision:1,updatedBy:'owner@example.test',updatedAt:'2026-11-07'};
  const url=origin+'/staff/draft/saved?id='+bookingId;
  const forbidden=await handleWorkerRequest(new Request(url),env,undefined,{
    loadReview:async()=>{reads++;return saved;}
  });
  assert.equal(forbidden.status,403);
  const found=await handleWorkerRequest(new Request(url),env,undefined,{
    context,loadReview:async(_url,id)=>{
      reads++;assert.equal(id,bookingId);return saved;
    }
  });
  assert.equal(found.status,200);
  const html=await found.text();
  assert.match(html,/PKR 80,000/);
  assert.match(html,/NOT FOR CUSTOMER DELIVERY/);
  assert.equal(reads,1);
  const post=await handleWorkerRequest(new Request(url,{method:'POST'}),env,undefined,{context});
  assert.equal(post.status,405);
});

test('draft page only offers saving when feature enabled; revisions carry forward',async()=>{
  const uri=origin+'/staff/draft?id='+bookingId;
  const off=await handleWorkerRequest(new Request(uri),{...env,APEX_STAFF_DRAFTS_ENABLED:'false'},
    undefined,{context,draft:async()=>booking});
  assert.equal(off.status,200);
  assert.doesNotMatch(await off.text(),/Save internal draft/);
  const on=await handleWorkerRequest(new Request(uri),env,undefined,{
    context,draft:async()=>booking,loadReview:async()=>null
  });
  assert.equal(on.status,200);
  assert.match(await on.text(),/Save internal draft/);
  const saved=await handleWorkerRequest(new Request(uri),env,undefined,{
    context,draft:async()=>booking,
    loadReview:async()=>({
      snapshot:newReview(),revision:3,updatedBy:'owner@example.test',updatedAt:'2026-11-07'
    })
  });
  assert.equal(saved.status,200);
  assert.match(await saved.text(),/name="revision" value="3"/);
});

test('database conflicts are visible but no retries or external messages occur',async()=>{
  const response=await handleWorkerRequest(form(fields),env,undefined,{
    context,draft:async()=>booking,
    saveReview:async()=>{throw new DraftSaveError('Draft changed in another tab',409);}
  });
  assert.equal(response.status,409);
  assert.equal((await response.json() as {error:string}).error,'Draft changed in another tab');
});
