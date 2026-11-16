(function(){
  'use strict';
  const form=document.getElementById('booking');
  const pickupRequested=document.getElementById('transport-pickup');
  const dropoffRequested=document.getElementById('transport-dropoff');
  const noTransport=document.getElementById('transport-none');
  const pickupPanel=document.getElementById('pickup-location');
  const dropoffReuse=document.getElementById('dropoff-reuse');
  const sameDropoff=document.getElementById('same-dropoff');
  const message=document.getElementById('message');
  const submit=document.getElementById('submit');
  const preview=document.getElementById('preview');

  const dropoffPanel=document.getElementById('dropoff-location');
  const SERVICE_BOUNDS=[[72.81,33.43],[73.30,33.84]];
  const requestId=crypto.randomUUID();
  const traitNames=['friendly','fears','climber','foodSensitivities','barksExcessively','allergies','biteHistory','medicalConditions'];
  let challenge=null,turnstileId=null;

  function showMessage(text,bad){
    message.textContent=text;
    message.className=bad?'message error':'message';
    message.hidden=false;
  }
  // Map the two independent controls onto the existing validated API contract.
  function transportChoice(){
    if(pickupRequested.checked&&dropoffRequested.checked)return 'both';
    if(pickupRequested.checked)return 'pickup';
    if(dropoffRequested.checked)return 'dropoff';
    return 'none';
  }
  function inServiceArea(latitude,longitude){
    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&
      latitude>=SERVICE_BOUNDS[0][1]&&latitude<=SERVICE_BOUNDS[1][1]&&
      longitude>=SERVICE_BOUNDS[0][0]&&longitude<=SERVICE_BOUNDS[1][0];
  }
  // Exact candidates and confirmed gates are separate. No source can confirm itself.
  function locationControl(prefix){
    const name=prefix?'drop-off':'pickup';
    const input=document.getElementById(prefix+'maps-link');
    const status=document.getElementById(prefix+'coordinate-status');
    const link=document.getElementById(prefix+'selected-location-link');
    const locate=document.getElementById(prefix+'locate');
    const choose=document.getElementById(prefix+'choose-map');
    const review=document.getElementById(prefix+'gate-review');
    const confirm=document.getElementById(prefix+'confirm-gate');
    let point=null,candidate=null,version=0,timer=null;
    function clear(text){
      point=null;candidate=null;review.hidden=true;link.hidden=true;link.removeAttribute('href');
      status.textContent=text||'No '+name+' gate selected';
    }
    function setCandidate(latitude,longitude,source){
      if(!inServiceArea(latitude,longitude)){
        clear('Pickup and drop-off are available only in Islamabad and Rawalpindi.');return false;
      }
      point=null;
      candidate={latitude:Math.round(latitude*1e7)/1e7,longitude:Math.round(longitude*1e7)/1e7};
      review.hidden=source==='Map pin';
      status.textContent=(source||'Pin')+' selected. Check the vehicle entrance and confirm this gate.';
      link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(candidate.latitude+','+candidate.longitude);link.hidden=false;
      return true;
    }
    function confirmCandidate(){
      if(!candidate)return;
      point={...candidate};review.hidden=true;
      status.textContent=name==='pickup'?'Pickup vehicle gate confirmed.':'Drop-off vehicle gate confirmed.';
    }
    const control={
      name,input,choose,slot:document.getElementById(prefix+'map-slot'),
      point:()=>point,candidate:()=>candidate,setCandidate,confirm:confirmCandidate,
      invalidate:()=>{input.value='';clear('Map moved. Confirm the vehicle gate again.');},
      focus:()=>candidate&&!review.hidden?confirm.focus():choose.focus(),
      cancelPending:()=>{version++;clearTimeout(timer);},
      reset:()=>{version++;clearTimeout(timer);input.value='';clear();}
    };
    confirm.addEventListener('click',confirmCandidate);
    choose.addEventListener('click',()=>{version++;clearTimeout(timer);gateMap.open(control);});
    async function resolve(value,requestVersion,intent){
      // Explicit coordinates also work offline, without WebGL, a map or a resolver.
      const pair=value.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if(pair){
        if(requestVersion===version&&setCandidate(Number(pair[1]),Number(pair[2]),'Exact pin'))gateMap.open(control,intent);
        return;
      }
      try{
        const response=await fetch('/api/book/location',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:value})});
        const data=await response.json();if(requestVersion!==version)return;
        if(!response.ok){
          clear(data?.code==='OUT_OF_SERVICE_AREA'?'Pickup and drop-off are available only in Islamabad and Rawalpindi.':'That link does not expose an exact gate pin. Drop a pin in Google Maps and copy its link, or paste its latitude, longitude.');return;
        }
        if(setCandidate(data.latitude,data.longitude,'Google Maps pin'))gateMap.open(control,intent);
      }catch{
        if(requestVersion===version)clear('Could not read that link. Check your connection or paste the exact latitude, longitude.');
      }
    }
    input.addEventListener('input',()=>{
      version++;clearTimeout(timer);gateMap.closeFor(control);
      const value=input.value.trim(),requestVersion=version,intent=gateMap.userIntent();
      clear(value?'Reading gate pin…':undefined);
      if(value)timer=setTimeout(()=>resolve(value,requestVersion,intent),450);
    });
    locate.addEventListener('click',()=>{
      version++;clearTimeout(timer);gateMap.closeFor(control);input.value='';
      if(!navigator.geolocation){clear('Device location is unavailable. Choose on the map or paste a Google Maps gate link.');return;}
      const requestVersion=version,intent=gateMap.userIntent();clear('Finding your location…');
      navigator.geolocation.getCurrentPosition(result=>{
        if(requestVersion===version&&setCandidate(result.coords.latitude,result.coords.longitude,'Current location'))gateMap.open(control,intent);
      },()=>{
        if(requestVersion===version)clear('Location permission was not granted or your location is unavailable. Choose on the map or paste a Google Maps gate link.');
      },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
    });
    return control;
  }
  const pickup=locationControl('');
  const dropoff=locationControl('dropoff-');
  // One local, pinned CSP build and one hosted basemap, loaded only on demand.
  const gateMap=(function(){
    const panel=document.getElementById('gate-picker');
    const status=document.getElementById('map-status');
    const loading=document.getElementById('map-loading');
    const confirm=document.getElementById('map-confirm');
    const mobile=window.matchMedia('(max-width:700px)');
    let active=null,map=null,library=null,ready=false,failed=false,positioning=false,loadTimer=null,openVersion=0,intentVersion=0;
    function loadLibrary(){
      if(window.maplibregl)return Promise.resolve();
      if(library)return library;
      library=new Promise((resolve,reject)=>{
        const css=document.createElement('link');css.rel='stylesheet';css.href='/book/vendor/maplibre-gl-5.6.1.css';document.head.append(css);
        const script=document.createElement('script');script.src='/book/vendor/maplibre-gl-5.6.1.js';
        const timeout=setTimeout(()=>reject(new Error('map timeout')),12000);
        script.onload=()=>{clearTimeout(timeout);window.maplibregl?resolve():reject(new Error('map unavailable'));};
        script.onerror=()=>{clearTimeout(timeout);reject(new Error('map unavailable'));};
        document.head.append(script);
      });
      return library;
    }
    function update(){
      const closeEnough=map&&map.getZoom()>=16;
      confirm.disabled=!ready||failed||!closeEnough||!active?.candidate();
      if(failed){loading.hidden=false;loading.textContent='Map unavailable';status.textContent='The map could not load. You can still paste an exact gate link, use GPS or paste coordinates.';return;}
      loading.hidden=ready;
      status.textContent=!ready?'Loading the map. Link, coordinate and GPS selection also work without it.':!closeEnough?'Zoom in to the vehicle entrance, then place the pin at your gate.':active?.candidate()?'Check the pin is at the vehicle entrance, then confirm.':'Move the map or tap your vehicle gate, then confirm.';
    }
    function fail(){failed=true;clearTimeout(loadTimer);update();}
    function waitForTiles(){
      ready=false;clearTimeout(loadTimer);loadTimer=setTimeout(fail,12000);
    }
    function position(){
      if(!map||!active)return;
      positioning=true;waitForTiles();
      const p=active.candidate()||active.point();
      map.resize();map.jumpTo({center:p?[p.longitude,p.latitude]:[73.06,33.65],zoom:p?17:11.5});
      positioning=false;map.triggerRepaint();update();
    }
    function close(restoreFocus=true,userAction=true){
      openVersion++;if(userAction)intentVersion++;
      if(panel.open)panel.close();
      document.body.classList.remove('gate-map-open');
      if(active){active.choose.setAttribute('aria-expanded','false');if(restoreFocus)active.choose.focus();}
    }
    async function open(control,intent){
      if(control.slot.closest('[hidden]')||(intent!==undefined&&intent!==intentVersion))return;
      if(intent===undefined)intentVersion++;
      close(false,false);active=control;control.slot.append(panel);
      document.getElementById('gate-picker-title').textContent='Choose your '+control.name+' gate';
      if(mobile.matches){panel.showModal();document.body.classList.add('gate-map-open');}else panel.setAttribute('open','');
      control.choose.setAttribute('aria-expanded','true');
      const thisOpen=++openVersion;update();
      try{
        await loadLibrary();if(thisOpen!==openVersion||control.slot.closest('[hidden]'))return;
        if(!map){
          window.maplibregl.setWorkerUrl('/book/vendor/maplibre-gl-csp-worker-5.6.1.js');
          map=new window.maplibregl.Map({container:'map-canvas',style:'https://tiles.openfreemap.org/styles/liberty',center:[73.06,33.65],zoom:11.5,minZoom:9,maxZoom:20,maxBounds:SERVICE_BOUNDS,attributionControl:false,dragRotate:false,pitchWithRotate:false});
          map.touchZoomRotate.disableRotation();
          map.addControl(new window.maplibregl.NavigationControl({showCompass:false}),'top-right');
          map.getCanvas().setAttribute('aria-label','Gate map. Use arrow keys to move and plus or minus to zoom.');
          map.getCanvas().setAttribute('aria-describedby','map-instructions');
          map.on('idle',()=>{ready=true;clearTimeout(loadTimer);update();});
          map.on('error',fail);
          map.on('movestart',()=>{clearTimeout(loadTimer);ready=false;if(!positioning&&panel.open&&active){active.invalidate();update();}});
          map.on('moveend',()=>{
            if(positioning||!panel.open||!active)return;
            waitForTiles();const center=map.getCenter();active.setCandidate(center.lat,center.lng,'Map pin');update();
          });
          // Tapping and keyboard controls provide alternatives to dragging.
          map.on('click',event=>map.jumpTo({center:[event.lngLat.lng,event.lngLat.lat]}));
          map.getCanvas().addEventListener('webglcontextlost',fail);
          waitForTiles();
        }
        position();map.getCanvas().focus({preventScroll:true});
      }catch{if(thisOpen===openVersion)fail();}
    }
    document.getElementById('map-close').addEventListener('click',()=>close());
    document.getElementById('map-fallback').addEventListener('click',()=>{const control=active;close(false);control?.input.focus();});
    panel.addEventListener('cancel',event=>{event.preventDefault();close();});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
    confirm.addEventListener('click',()=>{if(!confirm.disabled&&active){active.confirm();close();}});
    // A viewport change must not leave an inline dialog outside the mobile focus trap.
    mobile.addEventListener('change',()=>{if(panel.open&&active)open(active);});
    return {open,userIntent:()=>++intentVersion,closeFor:control=>{if(active===control)close(false,false);},closeHidden:()=>{if(active&&active.slot.closest('[hidden]'))close(false);}};
  })();
  function displayTransport(){
    const pickupOn=pickupRequested.checked,dropoffOn=dropoffRequested.checked;
    pickupPanel.hidden=!pickupOn;
    dropoffReuse.hidden=!(pickupOn&&dropoffOn);
    dropoffPanel.hidden=!dropoffOn||(pickupOn&&sameDropoff.checked);
    pickupRequested.setAttribute('aria-expanded',String(pickupOn));
    dropoffRequested.setAttribute('aria-expanded',String(!dropoffPanel.hidden));
    if(pickupPanel.hidden)pickup.cancelPending();
    if(dropoffPanel.hidden)dropoff.cancelPending();
    gateMap.closeHidden();
  }
  pickupRequested.addEventListener('change',()=>{
    if(pickupRequested.checked){
      noTransport.checked=false;
      // If a drop-off-only customer already chose a pin, retain it when
      // they add pickup instead of silently overwriting that choice.
      if(dropoffRequested.checked&&dropoff.point())sameDropoff.checked=false;
    }
    displayTransport();
  });
  dropoffRequested.addEventListener('change',()=>{
    if(dropoffRequested.checked){
      noTransport.checked=false;
      if(pickupRequested.checked)sameDropoff.checked=!dropoff.point();
    }
    displayTransport();
  });
  noTransport.addEventListener('change',()=>{
    if(noTransport.checked){
      pickupRequested.checked=false;
      dropoffRequested.checked=false;
    }
    displayTransport();
  });
  sameDropoff.addEventListener('change',displayTransport);

  function field(data,name){return String(data.get(name)||'').trim();}
  function optional(data,name){return field(data,name)||undefined;}
  function payload(){
    const data=new FormData(form);
    const personalityTraits={};
    for(const key of traitNames){
      const answer=field(data,'trait_'+key);
      if(answer!=='Yes'&&answer!=='No')throw new Error('Complete the care questions.');
      personalityTraits[key]=answer==='Yes';
    }
    const choice=transportChoice();
    const needsTransport=choice!=='none';
    if(!needsTransport&&!noTransport.checked){
      pickupRequested.focus();
      throw new Error('Select pickup, drop-off, or no transport needed.');
    }
    const primary=choice==='dropoff'?dropoff:pickup;
    if(needsTransport&&!primary.point()){
      primary.focus();
      throw new Error('Select the '+(choice==='dropoff'?'drop-off':'pickup')+' vehicle gate and confirm it.');
    }
    if(choice==='both'&&!sameDropoff.checked&&!dropoff.point()){
      dropoff.focus();
      throw new Error('Select the separate drop-off vehicle gate and confirm it.');
    }
    const details={
      ownerAddress:field(data,'ownerAddress'),
      emergencyContactPhone:field(data,'emergencyContactPhone'),
      breed:field(data,'breed'),gender:field(data,'gender'),age:field(data,'age'),
      vaccinationStatus:field(data,'vaccinationStatus'),
      distemperHistory:field(data,'distemperHistory'),
      veterinarianPhone:optional(data,'veterinarianPhone'),
      personalityTraits,
      specialInstructions:optional(data,'specialInstructions'),
      medicationFeedingInstructions:optional(data,'medicationFeedingInstructions'),
      pickupDropoffRequested:needsTransport,
      cameraCageRequested:field(data,'cameraCageRequested')==='yes',
      termsAccepted:data.get('termsAccepted')==='on',
      whatsappInvoiceOptIn:data.get('whatsappInvoiceOptIn')==='on'
    };
    const booking={
      source:'website',externalResponseId:requestId,
      customerName:field(data,'customerName'),phone:field(data,'phone'),
      email:optional(data,'email'),petName:field(data,'petName'),
      startDate:field(data,'startDate'),endDate:field(data,'endDate'),
      details
    };
    if(needsTransport){
      booking.transportLocation={
        ...(choice==='dropoff'?dropoff.point():pickup.point()),
        service:choice,customerConfirmed:true
      };
      if(choice==='both'&&!sameDropoff.checked)
        booking.transportDropoffLocation={...dropoff.point(),customerConfirmed:true};
    }
    return booking;
  }
  form.addEventListener('submit',async function(e){
    e.preventDefault();message.hidden=true;
    if(!form.reportValidity())return;
    const data=new FormData(form);
    const start=field(data,'startDate'),end=field(data,'endDate');
    if(end<start){showMessage('Boarding end date cannot be earlier than start date.',true);return;}
    let booking;
    try{booking=payload();}
    catch(e){showMessage(e.message,true);return;}
    if(!challenge){showMessage('Complete the security verification and try again.',true);return;}
    submit.disabled=true;submit.textContent='Sending request…';
    try{
      const response=await fetch('/api/book',{
        method:'POST',credentials:'omit',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({booking,turnstileToken:challenge})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error||'The request could not be sent.');
      form.hidden=true;
      const success=document.getElementById('complete');
      success.hidden=false;
      document.getElementById('reference').textContent=body.reference||'';
      success.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      showMessage(e.message||'Network error. Check your connection and try again.',true);
      challenge=null;
      if(window.turnstile&&turnstileId!==null)window.turnstile.reset(turnstileId);
    }finally{
      submit.textContent='Send booking request';
      submit.disabled=challenge===null;
    }
  });
  displayTransport();
  fetch('/api/book/config',{credentials:'omit',cache:'no-store'}).then(function(res){
    if(!res.ok)throw new Error('Not available');
    return res.json();
  }).then(function(config){
    if(config.enabled!==true||typeof config.siteKey!=='string')return;
    if(!window.turnstile)throw new Error('Security check unavailable');
    turnstileId=window.turnstile.render('#turnstile',{
      sitekey:config.siteKey,
      action:'apex-booking',
      callback:function(token){challenge=token;submit.disabled=false;},
      'expired-callback':function(){challenge=null;submit.disabled=true;},
      'error-callback':function(){challenge=null;submit.disabled=true;}
    });
    preview.hidden=true;
  }).catch(function(){preview.textContent='Booking submissions are unavailable here. Please use the existing booking Form.';});
})();
