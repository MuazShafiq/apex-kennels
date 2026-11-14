import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DeliveryError,sendInvoiceDocument,verifyInvoiceWebhook,parseInvoiceWebhook,webhookState,type DeliveryConfig} from './invoice-delivery.ts';
const config:DeliveryConfig={enabled:'true',apiVersion:'v24.0',accessToken:'synthetic-token-'.repeat(4),phoneNumberId:'123456789012',template:'invoice_utility_pdf',language:'en_US'};
const input={recipient:'03001234567',invoiceNumber:'0123',pdf:new TextEncoder().encode('%PDF-'+'.'.repeat(200))};
const fake=(handler:(url:string,init?:RequestInit)=>Promise<Response>):typeof fetch=>handler as typeof fetch;
test('disabled customer sending never calls the provider',async()=>{
  let called=false;await assert.rejects(sendInvoiceDocument({...config,enabled:undefined},input,fake(async()=>{called=true;return new Response();})),DeliveryError);assert.equal(called,false);
});
test('official media upload then utility document template; no private URLs or care data',async()=>{
  const calls:string[]=[];
  const result=await sendInvoiceDocument(config,input,fake(async(url,init)=>{
    calls.push(url);assert.equal(init?.redirect,'manual');
    if(url.endsWith('/media')){const f=init?.body as FormData;assert.equal(f.get('messaging_product'),'whatsapp');assert.equal((f.get('file') as File).type,'application/pdf');return Response.json({id:'12345678'});}
    const body=JSON.parse(init?.body as string);assert.equal(body.to,'923001234567');
    assert.deepEqual(body.template.components,[{type:'header',parameters:[{type:'document',document:{id:'12345678',filename:'apex-invoice-0123.pdf'}}]},
      {type:'body',parameters:[{type:'text',text:'0123'}]}]);
    assert.equal(JSON.stringify(body).includes('https:'),false);
    return Response.json({messages:[{id:'wamid.test_123456=='}]});
  }));assert.equal(result.messageId,'wamid.test_123456==');assert.equal(calls.length,2);
});
test('upload failure is safe, message timeout/5xx/malformed acceptance is ambiguous',async()=>{
  for(const failure of ['timeout','server','malformed','client','upload','proxy','http_timeout']){
    const run=sendInvoiceDocument(config,input,fake(async url=>{
      if(url.endsWith('/media'))return failure==='upload'?new Response('',{status:500}):Response.json({id:'12345678'});
      if(failure==='timeout')throw new Error('socket closed');
      if(failure==='server')return new Response('',{status:500});
      if(failure==='client')return Response.json({error:{code:100,type:'OAuthException'}},{status:400});
      if(failure==='proxy')return new Response('upstream connection interrupted',{status:400});
      if(failure==='http_timeout')return Response.json({error:{code:100,type:'OAuthException'}},{status:408});
      return Response.json({messages:[]});
    }));await assert.rejects(run,(e:unknown)=>e instanceof DeliveryError&&e.kind===(['client','upload'].includes(failure)?'failed':'ambiguous'));
  }
});
test('webhook signs exact bytes, rejects missing/malformed/changed signature',()=>{
  const raw=new TextEncoder().encode('{"object":"whatsapp_business_account","entry":[]}');const secret='synthetic-app-secret-123456';
  const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifyInvoiceWebhook(raw,sig,secret),true);assert.equal(verifyInvoiceWebhook(raw,null,secret),false);
  assert.equal(verifyInvoiceWebhook(new TextEncoder().encode(' '+new TextDecoder().decode(raw)),sig,secret),false);
  assert.equal(verifyInvoiceWebhook(raw,'sha256=not-hex',secret),false);
});
test('webhook binds sender, filters recipient and separates acceptance from delivery',()=>{
  const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:config.phoneNumberId},
    statuses:[{id:'wamid.test_123456==',recipient_id:'923001234567',status:'sent',timestamp:'1794690000'},
      {id:'wamid.test_123456==',recipient_id:'923001234567',status:'read',timestamp:'1794690001'}],messages:[{text:{body:'private care'}}]}}]}]};
  const raw=new TextEncoder().encode(JSON.stringify(payload));assert.deepEqual(parseInvoiceWebhook(raw,'999999999999'),[]);
  const events=parseInvoiceWebhook(raw,config.phoneNumberId);assert.deepEqual(events.map(e=>e.state),['provider_accepted','delivered']);
  assert.equal(JSON.stringify(events).includes('private care'),false);
  assert.equal(webhookState('provider_accepted','provider_accepted'),'provider_accepted');
  assert.equal(webhookState('failed','delivered'),'delivered');assert.equal(webhookState('delivered','failed'),'delivered');
  assert.equal(webhookState('delivered','provider_accepted'),'delivered');assert.equal(webhookState('failed','provider_accepted'),'failed');
});
