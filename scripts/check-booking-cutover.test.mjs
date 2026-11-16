import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkBookingCutover} from './check-booking-cutover.mjs';

const base='https://apex.example';
function fixture(overrides={}){
  const calls=[];
  return {calls,fetcher:async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'manual');
    const path=url.pathname;
    if(path==='/api/health')return Response.json({status:'ok',service:'apex-intake'});
    if(path==='/api/book/config')return Response.json(overrides.config??{enabled:true,siteKey:'public-test-key'});
    if(path==='/api/book'){
      assert.equal(options.body,'{}');
      assert.equal(options.method,'POST');
      return new Response(null,{status:overrides.postStatus??(options.headers.Origin===base?400:403)});
    }
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
