import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRANSPORT_SERVICE_BOUNDS,isTransportServiceLocation} from './transport-service-area.ts';
import {validateCustomerLocation} from './customer-location-input.ts';

test('one consistent transport coverage envelope includes common Islamabad/Rawalpindi destinations',()=>{
  assert.deepEqual([...TRANSPORT_SERVICE_BOUNDS],[72.81,33.43,73.30,33.84]);
  for(const [latitude,longitude] of [
    [33.6844,73.0479], // Islamabad centre
    [33.5651,73.0169], // Rawalpindi centre
    [33.52,73.10],     // Bahria-side urban area
    [33.73,72.95]      // western Islamabad
  ])assert.equal(isTransportServiceLocation(latitude,longitude),true);
});
test('Lahore, Kashmir, missing and nonfinite pins cannot be saved for transport',()=>{
  for(const [latitude,longitude] of [
    [31.52,74.35],[34.10,73.39],[33.61,72.75],[NaN,73.0],[33.7,Infinity]
  ]){
    assert.equal(isTransportServiceLocation(latitude,longitude),false);
    assert.throws(()=>validateCustomerLocation({
      latitude,longitude,service:'pickup',customerConfirmed:true
    }));
  }
});
test('UI uses Google Maps link and device location, with the same service boundary as server',()=>{
  const html=readFileSync('public/book/index.html','utf8');
  const js=readFileSync('public/book/app.js','utf8');
  assert.match(html,/Islamabad and Rawalpindi only/);
  assert.doesNotMatch(html,/id="place-area"|confirm-gate|Lahore<\/option>/);
  assert.match(html,/href="https:\/\/www\.google\.com\/maps\/search\//);
  assert.doesNotMatch(html,/maplibre|openfreemap/i);
  assert.match(js,/\[\[72\.81,33\.43\],\[73\.30,33\.84\]\]/);
  assert.doesNotMatch(js,/gate\.checked|confirm-gate|maplibregl/);
});
