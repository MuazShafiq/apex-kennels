import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkBookingCutover} from './check-booking-cutover.mjs';

const base='https://apex.example';
const worker='https://apex-kennels-api.muaz-shafiq18.workers.dev';
const pages='https://apexkennels.pages.dev';
function fixture(overrides={}){
  const calls=[];
  return {calls,fetcher:async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'manual');
    const path=url.pathname;
    const onPages=url.origin===pages;
    if(path==='/api/health')return Response.json({status:'ok',service:'apex-intake'});
    if(path==='/api/book/config')
      return Response.json((onPages?overrides.pagesConfig:overrides.config)??{enabled:true,siteKey:'public-test-key'});
    if(path==='/api/book'){
      assert.equal(options.body,'{}');
      assert.equal(options.method,'POST');
      const sameOrigin=options.headers.Origin===url.origin;
      const status=onPages?(sameOrigin?overrides.pagesSameOriginStatus:overrides.pagesForeignStatus):overrides.postStatus;
      return new Response(null,{status:status??(sameOrigin?400:403)});
    }
    if(onPages)return new Response(null,{status:overrides.pagesPrivateStatus??404});
    assert(path.startsWith('/staff'));
    return new Response(null,{status:overrides.staffStatus??302,headers:{location:overrides.location??'https://team.cloudflareaccess.com/cdn-cgi/access/login'}});
  }};
}
test('live monitor sends only empty invalid envelopes and no credentials',async()=>{
  const f=fixture();await checkBookingCutover(base,f.fetcher);
  assert.equal(f.calls.length,8);
  assert(f.calls.every(x=>!x.options.headers?.Authorization));
  assert(f.calls.filter(x=>x.options.method==='POST').every(x=>x.options.body==='{}'));
});
test('closed/malformed config stops before POST',async()=>{
  for(const config of [{enabled:false},{enabled:true},{enabled:true,siteKey:''}]){
    const f=fixture({config});await assert.rejects(checkBookingCutover(base,f.fetcher));
    assert.equal(f.calls.length,2);
  }
});
test('unexpected writes, data exposure or unsafe auth redirects fail',async()=>{
  for(const overrides of [{postStatus:201},{postStatus:503},{staffStatus:200},{location:'https://evil.example/'},{location:'http://team.cloudflareaccess.com/'}]){
    const f=fixture(overrides);await assert.rejects(checkBookingCutover(base,f.fetcher));
  }
});
test('non-origin or insecure targets fail before any request',async()=>{
  for(const origin of ['http://apex.example','https://user:password@apex.example','https://apex.example/path','https://apex.example/?query']){
    const f=fixture();await assert.rejects(checkBookingCutover(origin,f.fetcher));assert.equal(f.calls.length,0);
  }
});
test('canonical production monitor also checks the Pages gateway without writing bookings',async()=>{
  const f=fixture();await checkBookingCutover(worker,f.fetcher);
  const pagesCalls=f.calls.filter(x=>x.url.origin===pages);
  assert.deepEqual(pagesCalls.map(x=>x.url.pathname),[
    '/api/book/config','/api/book','/api/book','/staff','/staff/api/bookings','/staff/booking/action','/api/ingest'
  ]);
  assert.deepEqual(pagesCalls.filter(x=>x.options.method==='POST').map(x=>x.options.headers.Origin),[
    pages,'https://invalid.example'
  ]);
  assert(f.calls.every(x=>!x.options.headers?.Authorization && !x.options.headers?.Cookie));
});
test('closed Pages, wrong rejection or exposed Pages routes fail with a healthy Worker',async()=>{
  for(const [overrides,message] of [
    [{pagesConfig:{enabled:false}},/not configured live on .*pages.dev/],
    [{pagesSameOriginStatus:503},/invalid-envelope\/origin rejection failed on .*pages.dev/],
    [{pagesForeignStatus:400},/invalid-envelope\/origin rejection failed on .*pages.dev/],
    [{pagesPrivateStatus:200},/Pages private route/]
  ]){
    const f=fixture(overrides);
    await assert.rejects(checkBookingCutover(worker,f.fetcher),message);
  }
});
