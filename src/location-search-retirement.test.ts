import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkerRequest} from './cloudflare-worker.ts';
import {LocationSearchBudget} from './location-search-budget.ts';

test('retired autocomplete is absent and persisted namespace compatibility is inert',async()=>{
  for(const method of ['GET','POST']){
    const response=await handleWorkerRequest(new Request('https://apex.invalid/api/book/search',{
      method,...(method==='POST'?{headers:{Origin:'https://apex.invalid','Content-Type':'application/json'},body:'{"query":"F-10"}'}:{})
    }),{GEOAPIFY_API_KEY:'synthetic-routing-key'});
    assert.equal(response.status,404);
  }
  const compatibility=new LocationSearchBudget();
  const response=await compatibility.fetch(new Request('https://location-search-budget.internal/consume',{method:'POST'}));
  assert.equal(response.status,410);
});

test('booking map CSP permits only the free map host and local worker',async()=>{
  const response=await handleWorkerRequest(new Request('https://apex.invalid/book'),{
    ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}
  });
  const policy=response.headers.get('Content-Security-Policy')!;
  assert.ok(policy.includes("connect-src 'self' https://tiles.openfreemap.org;"));
  assert.ok(policy.includes("worker-src 'self';"));
  assert.ok(policy.includes("script-src 'self' https://challenges.cloudflare.com;"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.doesNotMatch(policy,/unsafe-eval|https:\/\/\*|api.geoapify/);
});
