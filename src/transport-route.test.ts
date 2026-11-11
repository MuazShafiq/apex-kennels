import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExplicitCoordinatePin,routeApexTransport} from './transport-route.ts';

// Completely synthetic coordinate fixtures, NOT Apex's real kennel location.
const kennel={lat:33.654,lon:73.034};
const customer={lat:33.704,lon:73.075};
const access={lat:33.690,lon:73.061}; // SYNTHETIC: not the real restaurant
const confirmed={kennelPin:kennel,customerPin:customer,
  kennelPinConfirmed:true,customerPinConfirmed:true,
  kennelAccessWaypoint:access,kennelAccessWaypointConfirmed:true} as const;
const key='synthetic-demo-api-key';

test('accepts explicit geographic pins but never treats a map viewport or text address as a pin',()=>{
  assert.deepEqual(parseExplicitCoordinatePin('33.704,73.075'),customer);
  assert.deepEqual(parseExplicitCoordinatePin('https://maps.google.com/?q=33.704%2C73.075'),customer);
  assert.deepEqual(parseExplicitCoordinatePin('https://www.google.com/maps?query=33.704%2C73.075'),customer);
  assert.equal(parseExplicitCoordinatePin('House 15, Islamabad'),null);
  assert.equal(parseExplicitCoordinatePin('https://www.google.com/maps/@33.704,73.075,15z'),null);
  assert.equal(parseExplicitCoordinatePin('https://maps.app.goo.gl/abc123'),null);
  assert.equal(parseExplicitCoordinatePin('https://example.com/?q=33.704,73.075'),null);
  assert.equal(parseExplicitCoordinatePin('33.704,173.075'),null);
});

test('no kennel pin, no confirmed customer pin, and no unambiguous trip types mean NO route calls',async()=>{
  let calls=0;
  const f:typeof fetch=async()=>{calls++;return new Response('{}');};
  const cases=[
    {...confirmed,kennelPin:undefined,visit:'pickup' as const},
    {...confirmed,kennelPinConfirmed:false,visit:'pickup' as const},
    {...confirmed,customerPinConfirmed:false,visit:'dropoff' as const},
    {...confirmed,customerPin:kennel,visit:'pickup' as const},
    {...confirmed,visit:undefined},
    {...confirmed,kennelAccessWaypoint:undefined,visit:'pickup' as const},
  ];
  for(const c of cases) {
    const r=await routeApexTransport(c,{apiKey:key,fetcher:f});
    assert.equal(r.ok,false);
  }
  assert.equal(calls,0);
});

test('one kennel > customer > kennel route counts 1 full round trip for pickup',async()=>{
  const seen:string[]=[];
  const f:typeof fetch=async(input,init)=>{
    seen.push(String(input));
    assert.equal(init?.method,'GET');
    assert.equal(init?.redirect,'manual');
    return new Response(JSON.stringify({
      type:'FeatureCollection',
      features:[{type:'Feature',properties:{distance:19450},geometry:{type:'MultiLineString',coordinates:[]}}]
    }),{status:200});
  };
  const r=await routeApexTransport({...confirmed,visit:'pickup'},
    {apiKey:key,fetcher:f,now:new Date('2026-11-05T10:00:00Z')});
  assert.equal(r.ok,true);
  if(r.ok){
    assert.equal(r.estimate.loopDistanceKm,19.45);
    assert.equal(r.estimate.totalDrivenKm,19.45);
    assert.equal(r.estimate.plannedRoundTrips,1);
    assert.deepEqual(r.estimate.kennelAccessWaypoint,access);
    assert.equal(r.estimate.status,'ROUTE_REVIEW_REQUIRED');
  }
  assert.equal(seen.length,1);
  const url=new URL(seen[0]);
  assert.equal(url.hostname,'api.geoapify.com');
  assert.equal(url.pathname,'/v1/routing');
  assert.equal(url.searchParams.get('mode'),'drive');
  assert.equal(url.searchParams.get('waypoints'),
    '33.654,73.034|33.69,73.061|33.704,73.075|33.69,73.061|33.654,73.034');
});

test('explicit pickup AND drop-off require two driven round trips, not one',async()=>{
  const r=await routeApexTransport({...confirmed,visit:'pickup_and_dropoff'},{
    apiKey:key,fetcher:async()=>new Response(JSON.stringify({
      features:[{properties:{distance:19450}}]
    }),{status:200}),
  });
  assert.equal(r.ok,true);
  if(r.ok) {
    assert.equal(r.estimate.plannedRoundTrips,2);
    assert.equal(r.estimate.totalDrivenKm,38.9);
    assert.equal(r.estimate.needsStaffConfirmation,true);
  }
});

test('separate pickup and drop-off gates use two independent road loops, not doubled distance',async()=>{
  const dropoff={lat:33.59,lon:73.015};
  const seen:string[]=[];
  const r=await routeApexTransport({...confirmed,visit:'pickup_and_dropoff',
    dropoffPin:dropoff,dropoffPinConfirmed:true},{
    apiKey:key,fetcher:async request=>{
      const u=new URL(String(request));
      seen.push(u.searchParams.get('waypoints')??'');
      const meters=seen.length===1?19450:24770;
      return new Response(JSON.stringify({features:[{properties:{distance:meters}}]}),{status:200});
    }
  });
  assert.equal(r.ok,true);
  if(r.ok){
    assert.equal(r.estimate.loopDistanceKm,19.45);
    assert.equal(r.estimate.dropoffLoopDistanceKm,24.77);
    assert.equal(r.estimate.totalDrivenKm,44.22);
    assert.deepEqual(r.estimate.dropoffPin,dropoff);
    assert.equal(r.estimate.plannedRoundTrips,2);
  }
  assert.equal(seen.length,2);
  assert.ok(seen[0].includes('33.704,73.075'));
  assert.ok(seen[1].includes('33.59,73.015'));
  assert.ok(seen.every(x=>x.startsWith('33.654,73.034|33.69,73.061|')&&
    x.endsWith('|33.69,73.061|33.654,73.034')));
});
test('unverified, out-of-area or unavailable second loop fails closed',async()=>{
  const dropoff={lat:33.59,lon:73.015};let calls=0;
  const fetcher:typeof fetch=async()=>{
    calls++;return new Response(JSON.stringify({features:[{properties:{distance:19450}}]}),{status:200});
  };
  for(const input of [
    {...confirmed,visit:'pickup_and_dropoff' as const,dropoffPin:dropoff,dropoffPinConfirmed:false},
    {...confirmed,visit:'pickup_and_dropoff' as const,dropoffPin:{lat:31.52,lon:74.35},dropoffPinConfirmed:true},
    {...confirmed,visit:'pickup' as const,dropoffPin:dropoff,dropoffPinConfirmed:true}
  ]){
    assert.equal((await routeApexTransport(input,{apiKey:key,fetcher})).ok,false);
  }
  assert.equal(calls,0);
  const failed=await routeApexTransport({...confirmed,visit:'pickup_and_dropoff',
    dropoffPin:dropoff,dropoffPinConfirmed:true},{
      apiKey:key,fetcher:async()=>{
        calls++;return calls===1
          ? new Response(JSON.stringify({features:[{properties:{distance:19450}}]}),{status:200})
          : new Response('down',{status:503});
      }
    });
  assert.equal(failed.ok,false);assert.equal(calls,2);
});

test('routing API key missing or unusable/unreachable road response fails closed',async()=>{
  const noKey=await routeApexTransport({...confirmed,visit:'pickup'});
  assert.equal(noKey.ok,false);
  if(!noKey.ok) assert.equal(noKey.reason,'ROUTE_NOT_AVAILABLE');
  const invalid=await routeApexTransport({...confirmed,visit:'pickup'},{
    apiKey:key,fetcher:async()=>new Response(JSON.stringify({features:[{properties:{distance:'19450'}}]}),{status:200})
  });
  assert.equal(invalid.ok,false);
  const down=await routeApexTransport({...confirmed,visit:'pickup'},{
    apiKey:key,fetcher:async()=>new Response('down',{status:503})
  });
  assert.equal(down.ok,false);
});

test('out-of-area customer pin cannot generate transport quote, including legacy Form bookings',async()=>{
  let calls=0;
  const result=await routeApexTransport({
    ...confirmed,
    customerPin:{lat:31.52,lon:74.35}, // Lahore
    visit:'pickup'
  },{
    apiKey:key,
    fetcher:async()=>{calls++;return new Response('{}');}
  });
  assert.equal(result.ok,false);
  if(!result.ok)assert.equal(result.reason,'OUT_OF_SERVICE_AREA');
  assert.equal(calls,0);
});
