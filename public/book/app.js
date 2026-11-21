import { mountPlaqueLighting, setPlaqueName } from '/site/v106/plaque.js';

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
  let requestId=crypto.randomUUID();
  const traitNames=['friendly','fears','climber','foodSensitivities','barksExcessively','allergies','biteHistory','medicalConditions'];
  let challenge=null,turnstileId=null,sending=false;

  function showMessage(text){
    message.textContent=text;
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
    const google=document.getElementById(prefix+'google-gate');
    const status=document.getElementById(prefix+'coordinate-status');
    const link=document.getElementById(prefix+'selected-location-link');
    const locate=document.getElementById(prefix+'locate');
    const choose=document.getElementById(prefix+'choose-map');
    const review=document.getElementById(prefix+'gate-review');
    const confirm=document.getElementById(prefix+'confirm-gate');
    const card=document.getElementById(prefix+'gate-card');
    const state=document.getElementById(prefix+'gate-state');
    const coordinates=document.getElementById(prefix+'gate-coordinates');
    const sourceText=document.getElementById(prefix+'gate-source');
    const confirmed=document.getElementById(prefix+'gate-confirmed');
    let point=null,candidate=null,fallbackCandidate=false,version=0,timer=null;
    function renderCandidate(){
      card.hidden=!candidate;
      confirmed.hidden=!point;
      card.classList.toggle('ok',!!point);
      state.classList.toggle('ok',!!point);
      state.textContent=point?'Confirmed':candidate?'Check your pin':'Not set';
      updateSummary();
    }
    function clear(text){
      point=null;candidate=null;review.hidden=true;link.hidden=true;link.removeAttribute('href');
      status.textContent=text||'No '+name+' gate selected';
      renderCandidate();
    }
    function setCandidate(latitude,longitude,source){
      if(!inServiceArea(latitude,longitude)){
        clear('Pickup and drop-off are available only in Islamabad and Rawalpindi.');return false;
      }
      point=null;
      candidate={latitude:Math.round(latitude*1e7)/1e7,longitude:Math.round(longitude*1e7)/1e7};
      fallbackCandidate=source!=='Map pin';
      review.hidden=!fallbackCandidate;
      status.textContent=(source||'Pin')+' selected. Check the vehicle entrance and confirm this gate.';
      link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(candidate.latitude+','+candidate.longitude);
      link.hidden=false;
      coordinates.textContent=candidate.latitude.toFixed(5)+', '+candidate.longitude.toFixed(5);
      sourceText.textContent=source||'Selected pin';
      renderCandidate();
      return true;
    }
    function confirmCandidate(){
      if(!candidate)return;
      point={...candidate};review.hidden=true;
      status.textContent=name==='pickup'?'Pickup vehicle gate confirmed.':'Drop-off vehicle gate confirmed.';
      renderCandidate();
    }
    const control={
      name,choose,slot:document.getElementById(prefix+'map-slot'),
      point:()=>point,candidate:()=>candidate,setCandidate,confirm:confirmCandidate,
      showFallbackReview:visible=>{review.hidden=!visible||!candidate||!!point||!fallbackCandidate;},
      openGoogle:()=>{google.open=true;input.focus();},
      invalidate:()=>{input.value='';clear('Map moved. Confirm the vehicle gate again.');},
      focus:()=>candidate&&!review.hidden?confirm.focus():choose.focus(),
      cancelPending:()=>{version++;clearTimeout(timer);},
      reset:()=>{version++;clearTimeout(timer);input.value='';clear();}
    };
    confirm.addEventListener('click',confirmCandidate);
    const openMap=()=>{version++;clearTimeout(timer);gateMap.open(control);};
    choose.addEventListener('click',openMap);
    document.getElementById(prefix+'adjust-gate').addEventListener('click',openMap);
    document.getElementById(prefix+'change-gate').addEventListener('click',()=>{
      gateMap.closeFor(control);control.reset();input.focus();
    });
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
          clear(data?.code==='OUT_OF_SERVICE_AREA'?'Pickup and drop-off are available only in Islamabad and Rawalpindi.':'That link has no exact gate pin. Touch and hold your vehicle entrance to drop a pin, then tap Share → Copy link. Paste that link or the pin’s latitude, longitude.');return;
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
    const closeButton=document.getElementById('map-close');
    const mapStyle='https://tiles.openfreemap.org/styles/liberty';
    let active=null,map=null,library=null,ready=false,failed=false,contextLost=false,positioning=false,loadTimer=null,openVersion=0,intentVersion=0,lastView=null,movementActive=false;
    function loadLibrary(){
      if(window.maplibregl)return Promise.resolve();
      if(library)return library;
      if(!document.getElementById('gate-map-css')){
        const css=document.createElement('link');css.id='gate-map-css';css.rel='stylesheet';css.href='/book/vendor/maplibre-gl-5.6.1.css';document.head.append(css);
      }
      library=new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='/book/vendor/maplibre-gl-5.6.1.js';
        const timeout=setTimeout(()=>{script.remove();reject(new Error('map timeout'));},12000);
        script.onload=()=>{clearTimeout(timeout);window.maplibregl?resolve():reject(new Error('map unavailable'));};
        script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('map unavailable'));};
        document.head.append(script);
      }).catch(error=>{library=null;throw error;});
      return library;
    }
    function update(){
      const closeEnough=map&&map.getZoom()>=16;
      confirm.disabled=!ready||failed||contextLost||movementActive||!closeEnough||!active?.candidate();
      loading.hidden=ready;
      loading.textContent=failed?'Map unavailable':'Loading map…';
      if(failed||contextLost){
        status.textContent=contextLost?'The map display was interrupted. You can use Google Maps to check your gate.':'The map could not load. Use Google Maps or reopen the map to try again.';
        return;
      }
      status.textContent=!ready?'Loading the map. Link, coordinate and GPS selection also work without it.':!closeEnough?'Zoom in to the vehicle entrance, then place the pin at your gate.':active?.candidate()?'Check the pin is at the vehicle entrance, then confirm.':'Move the map or tap your vehicle gate, then confirm.';
    }
    function fail(){
      clearTimeout(loadTimer);
      map?.remove();map=null;ready=false;failed=true;contextLost=false;update();
    }
    function position(){
      if(!map||!active)return;
      positioning=true;movementActive=false;map.stop();
      const p=active.candidate()||active.point();
      map.resize();map.jumpTo({center:p?[p.longitude,p.latitude]:[73.06,33.65],zoom:p?17:11.5});
      lastView={...map.getCenter(),zoom:map.getZoom()};
      positioning=false;map.triggerRepaint();update();
    }
    function close(restoreFocus=true,userAction=true){
      openVersion++;movementActive=false;if(userAction)intentVersion++;
      if(panel.open)panel.close();
      document.body.classList.remove('gate-map-open');
      if(active){
        active.showFallbackReview(true);
        active.choose.setAttribute('aria-expanded','false');
        if(restoreFocus)active.choose.focus();
      }
    }
    async function open(control,intent){
      if(control.slot.closest('[hidden]')||(intent!==undefined&&intent!==intentVersion))return;
      if(intent===undefined)intentVersion++;
      close(false,false);active=control;control.slot.append(panel);
      document.getElementById('gate-picker-title').textContent='Choose your '+control.name+' gate';
      panel.showModal();
      document.body.classList.add('gate-map-open');
      control.showFallbackReview(false);
      control.choose.setAttribute('aria-expanded','true');
      closeButton.focus();failed=false;
      const thisOpen=++openVersion;update();
      try{
        await loadLibrary();if(thisOpen!==openVersion||control.slot.closest('[hidden]'))return;
        if(!map){
          window.maplibregl.setWorkerUrl('/book/vendor/maplibre-gl-csp-worker-5.6.1.js');
          map=new window.maplibregl.Map({container:'map-canvas',style:mapStyle,center:[73.06,33.65],zoom:11.5,minZoom:9,maxZoom:20,maxBounds:SERVICE_BOUNDS,attributionControl:false,dragRotate:false,pitchWithRotate:false});
          map.touchZoomRotate.disableRotation();
          map.addControl(new window.maplibregl.NavigationControl({showCompass:false}),'top-right');
          map.getCanvas().setAttribute('aria-label','Gate map. Use arrow keys to move and plus or minus to zoom.');
          map.getCanvas().setAttribute('aria-describedby','map-instructions');
          // The first rendered frame after style initialization makes the
          // controls usable. Tile requests can continue independently.
          map.once('style.load',()=>map.once('render',()=>{
            ready=true;clearTimeout(loadTimer);update();
          }));
          map.on('webglcontextlost',()=>{contextLost=true;update();});
          map.on('webglcontextrestored',()=>{contextLost=false;update();});
          loadTimer=setTimeout(fail,12000);
          map.on('movestart',event=>{
            // MapLibre also emits movement events on resize. Resizing the sheet
            // does not change the selected gate or restart its loading state.
            if(positioning||!panel.open||!active||(!event.originalEvent&&!event.gateSelection))return;
            movementActive=true;active.invalidate();update();
          });
          map.on('moveend',()=>{
            if(positioning||!panel.open||!active)return;
            const center=map.getCenter(),zoom=map.getZoom();
            const changed=!lastView||Math.abs(center.lat-lastView.lat)>1e-8||Math.abs(center.lng-lastView.lng)>1e-8||Math.abs(zoom-lastView.zoom)>1e-7;
            lastView={...center,zoom};
            if(!changed&&!movementActive)return;
            movementActive=false;active.invalidate();active.setCandidate(center.lat,center.lng,'Map pin');update();
          });
          // Tapping and keyboard controls provide alternatives to dragging.
          map.on('click',event=>map.jumpTo({center:[event.lngLat.lng,event.lngLat.lat]},{gateSelection:true}));
        }
        position();if(document.activeElement===closeButton)map.getCanvas().focus({preventScroll:true});
      }catch{if(thisOpen===openVersion)fail();}
    }
    // MapLibre can retain an errored tile for the current view. Retry visible
    // sources on reconnection while preserving the view and gate selection.
    window.addEventListener('online',()=>{
      if(failed&&panel.open){open(active);return;}
      if(!ready||!map)return;
      for(const source of Object.keys(map.getStyle().sources))map.refreshTiles(source);
    });
    closeButton.addEventListener('click',()=>close());
    panel.addEventListener('click',event=>{
      if(event.target!==panel)return;
      const bounds=panel.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();
    });
    document.getElementById('map-fallback').addEventListener('click',()=>{const control=active;close(false);control?.openGoogle();});
    panel.addEventListener('cancel',event=>{event.preventDefault();close();});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
    confirm.addEventListener('click',()=>{if(!confirm.disabled&&active){active.confirm();close();}});
    return {open,userIntent:()=>++intentVersion,closeFor:control=>{if(active===control)close(false,false);},closeHidden:()=>{if(active&&active.slot.closest('[hidden]'))close(false);}};
  })();
  function displayTransport(){
    const pickupOn=pickupRequested.checked,dropoffOn=dropoffRequested.checked;
    pickupPanel.hidden=!pickupOn;
    dropoffReuse.hidden=!(pickupOn&&dropoffOn);
    dropoffPanel.hidden=!dropoffOn||(pickupOn&&sameDropoff.checked);
    if(pickupPanel.hidden)pickup.cancelPending();
    if(dropoffPanel.hidden)dropoff.cancelPending();
    gateMap.closeHidden();
    updateSummary();
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
      whatsappServiceOptIn:data.get('whatsappServiceOptIn')==='on'
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

  const $=(selector,parent=document)=>parent.querySelector(selector);
  const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];
  const steps=$$('[data-step]',form);
  const stepLinks=$$('[data-pl]');
  const ticket=$('#stay-ticket');
  const mobileSummary=$('#mobile-summary');
  const summaryOpener=$('[data-sum-open]');
  const desktopSummary=$('[data-side]');
  const summaryViewport=matchMedia('(max-width: 1079px)');
  const mobileTicket=$('[data-mobile-ticket]');
  const formView=$('[data-form-view]');
  const complete=$('#complete');
  const plaque=$('[data-plaque]',complete);
  mountPlaqueLighting(plaque);
  const sendLabel=$('[data-send-l]',submit);
  const dateFormat=new Intl.DateTimeFormat('en-GB',{
    weekday:'short',day:'numeric',month:'short',timeZone:'UTC'
  });
  const pakistanDate=new Intl.DateTimeFormat('en-CA',{
    year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Karachi'
  });
  const moneyFormat=new Intl.NumberFormat('en-PK');
  const rates={no:{daily:2500,package:65000},yes:{daily:3000,package:80000}};
  const stepNames=['Dates & space','Your dog','Transport','Care','Your details'];
  const stepDefaults=steps.map(step=>$('[data-step-sum]',step).textContent);
  const completed=new Set();
  let current=0;

  function dateMilliseconds(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;
    const ms=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:NaN;
  }
  function stay(data){
    const start=dateMilliseconds(field(data,'startDate'));
    const end=dateMilliseconds(field(data,'endDate'));
    const days=end>=start?(end-start)/86400000+1:0;
    const space=field(data,'cameraCageRequested');
    const rate=rates[space];
    const hasPackageRate=days===30&&!!rate;
    const daily=rate?days*rate.daily:0;
    return {
      start,end,days,rate,hasPackageRate,daily,space,
      total:hasPackageRate?rate.package:daily,
      dates:days?dateFormat.format(start)+' → '+dateFormat.format(end):''
    };
  }
  function rupees(value){return 'Rs '+moneyFormat.format(value);}
  function billedDays(days){return days+(days===1?' billed day':' billed days');}
  function spaceLabel(space){
    return space==='yes'?'Camera cage':space==='no'?'Standard boarding':'';
  }
  function transportLabel(){
    const choice=transportChoice();
    if(choice==='none')return noTransport.checked?'None':'';
    const gate=control=>control.point()?'gate confirmed':'gate not set';
    if(choice==='both'){
      return sameDropoff.checked?'Pickup and drop-off · '+gate(pickup)
        :'Pickup · '+gate(pickup)+', drop-off · '+gate(dropoff);
    }
    return choice==='pickup'?'Pickup · '+gate(pickup):'Drop-off · '+gate(dropoff);
  }
  function summaryValue(selector,value,fallback){
    const node=$(selector);
    node.textContent=value||fallback;
    node.classList.toggle('muted',!value);
  }

  function updateSummary(){
    const data=new FormData(form);
    const s=stay(data);
    const name=field(data,'petName');
    const ticketName=$('[data-tk-name]');
    ticketName.classList.toggle('empty',!name);
    ticketName.firstChild.nodeValue=name||'Your dog';
    $('[data-tk-dates]').textContent=s.dates||'Dates not set';
    summaryValue('[data-tk-days]',s.days&&String(s.days),'—');
    summaryValue('[data-tk-space]',spaceLabel(s.space),'Not chosen');
    summaryValue('[data-tk-board]',s.rate?(s.hasPackageRate?'30-day rate':rupees(s.rate.daily)+' per billed day'):'','—');
    summaryValue('[data-tk-trans]',transportChoice()==='none'?(noTransport.checked?'None':''):'To be quoted','Not chosen');
    $('[data-tk-tot]').textContent=rupees(s.total);
    $('[data-mb-v]').textContent=rupees(s.total);
    $('[data-mb-t]').textContent=s.days?billedDays(s.days)+' · boarding subtotal':'Boarding subtotal';
    $('[data-pkg]').hidden=!s.hasPackageRate;
    $('[data-tk-pkg]').hidden=!s.hasPackageRate;
    $('[data-tk-was]').hidden=!s.hasPackageRate;
    $('[data-tk-was]').textContent=rupees(s.daily);
    for(const node of $$('[data-package-copy]')){
      node.textContent=s.hasPackageRate?'30-day rate applied. You save '+rupees(s.daily-s.total)+'.':'';
    }
    $('[data-days]').hidden=!s.days;
    if(s.days){
      $('[data-days-n]').textContent=billedDays(s.days);
      $('[data-days-r]').textContent=dateFormat.format(s.start)+' to '+dateFormat.format(s.end)+', both days included';
    }
    const vaccination=field(data,'vaccinationStatus');
    $('[data-vacc-note]').hidden=!(vaccination==='Partially vaccinated'||vaccination==='None'||field(data,'distemperHistory')==='Yes');
    const careNotes=$$('.trait[data-detail]').filter(trait=>{
      const yes=$('input:checked',trait)?.value==='Yes';
      trait.classList.toggle('yes',yes);
      return yes;
    }).map(trait=>trait.dataset.detail);
    $('[data-yes-note]').hidden=!careNotes.length;
    $('[data-yes-list]').textContent=careNotes.join(', ');
  }

  // Keep all five sections in the real form so edits are retained between steps.
  const checks=[
    data=>{
      const errors={};
      const s=stay(data);
      if(!Number.isFinite(s.start))errors.startDate='Choose an arrival date.';
      else if(field(data,'startDate')<pakistanDate.format(new Date()))errors.startDate='Arrival can’t be in the past.';
      if(!Number.isFinite(s.end))errors.endDate='Choose a collection date.';
      else if(s.end<s.start)errors.endDate='Collection must be on or after arrival.';
      if(!s.rate)errors.cameraCageRequested='Choose standard boarding or a camera cage.';
      return errors;
    },
    data=>requiredAnswers(data,{
      petName:'Tell us your dog’s name.',
      breed:'Add the breed, or “mixed”.',
      gender:'Choose male or female.',
      age:'Add an age, even roughly.',
      vaccinationStatus:'Choose a vaccination status.',
      distemperHistory:'Choose yes, no or not sure.'
    }),
    ()=>{
      const errors={};
      if(!pickupRequested.checked&&!dropoffRequested.checked&&!noTransport.checked)
        errors.transport='Choose pickup, drop-off, both, or no transport.';
      if(pickupRequested.checked&&!pickup.point())errors.pickupLink='Set and confirm the pickup gate.';
      if(dropoffRequested.checked&&!(pickupRequested.checked&&sameDropoff.checked)&&!dropoff.point())
        errors.dropoffLink='Set and confirm the drop-off gate.';
      return errors;
    },
    data=>requiredAnswers(data,Object.fromEntries(traitNames.map(name=>['trait_'+name,'Choose yes or no.']))),
    data=>{
      const errors=requiredAnswers(data,{
        customerName:'Add your full name.',
        phone:'Add your WhatsApp number.',
        emergencyContactPhone:'Add an emergency contact number.',
        ownerAddress:'Add your home address.',
        termsAccepted:'Please read and accept the boarding terms.',
        whatsappServiceOptIn:'Please agree to receive booking updates and your approved invoice on WhatsApp.'
      });
      if(!errors.phone&&field(data,'phone').replace(/\D/g,'').length<10)errors.phone='That number looks too short.';
      if(form.elements.email.validity.typeMismatch)errors.email='Check the email address, or leave it blank.';
      return errors;
    }
  ];
  function requiredAnswers(data,required){
    return Object.fromEntries(Object.entries(required).filter(([name])=>!field(data,name)));
  }
  function setError(fieldset,text){
    let note=$('.f-err',fieldset);
    if(!note){
      note=document.createElement('p');
      note.className='f-err';
      fieldset.append(note);
    }
    if(!note.id)note.id='booking-error-'+fieldset.dataset.f;
    note.hidden=!text;
    note.textContent=text||'';
    fieldset.classList.toggle('bad',!!text);
    for(const element of $$('input, textarea',fieldset)){
      const descriptions=new Set((element.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));
      if(text){
        descriptions.add(note.id);
        element.setAttribute('aria-invalid','true');
      }else{
        descriptions.delete(note.id);
        element.removeAttribute('aria-invalid');
      }
      if(descriptions.size)element.setAttribute('aria-describedby',[...descriptions].join(' '));
      else element.removeAttribute('aria-describedby');
    }
  }
  function showErrors(index,errors,focus=false){
    const step=steps[index];
    const fields=Object.keys(errors);
    for(const group of $$('[data-f]',step))setError(group,errors[group.dataset.f]);
    const alert=$('[data-sum-err]',step);
    alert.hidden=!fields.length;
    alert.textContent=fields.length===1?'One answer needs attention.':fields.length+' answers need attention.';
    if(focus&&fields.length){
      if(fields[0]==='pickupLink')pickup.focus();
      else if(fields[0]==='dropoffLink')dropoff.focus();
      else $('.bad input, .bad textarea',step)?.focus();
    }
    return fields.length===0;
  }
  function stepSummary(index,data){
    if(index===0){
      const s=stay(data);
      return billedDays(s.days)+' · '+spaceLabel(s.space);
    }
    if(index===1)return field(data,'petName')+' · '+field(data,'breed');
    if(index===2)return transportLabel();
    if(index===3)return 'All answered';
    return 'Contact information and boarding terms';
  }
  function renderSteps(){
    const data=new FormData(form);
    steps.forEach((step,index)=>{
      const active=index===current;
      const editable=index===0||completed.has(index-1)||completed.has(index);
      const stepButton=$('[data-step-h]',step);
      step.classList.toggle('cur',active);
      step.classList.toggle('done',completed.has(index));
      step.classList.toggle('locked',!editable);
      stepButton.disabled=!editable;
      stepButton.setAttribute('aria-expanded',String(active));
      if(active)stepButton.setAttribute('aria-current','step');
      else stepButton.removeAttribute('aria-current');
      $('[data-step-sum]',step).textContent=completed.has(index)&&!active?stepSummary(index,data):stepDefaults[index];
      $('.st-b',step).hidden=!active;
      stepLinks[index].disabled=!editable;
      stepLinks[index].classList.toggle('cur',active);
      stepLinks[index].classList.toggle('done',completed.has(index));
      if(active)stepLinks[index].setAttribute('aria-current','step');
      else stepLinks[index].removeAttribute('aria-current');
    });
    $('[data-prog-t]').textContent=stepNames[current];
    $('[data-prog-n]').textContent='STEP '+(current+1)+' OF '+steps.length;
    $('[data-prog-l]').style.setProperty('--p',((current+1)*100/steps.length)+'%');
  }
  function go(index,{focus=true}={}){
    if(sending||index===current)return;
    showErrors(current,{});
    message.hidden=true;
    current=index;
    renderSteps();
    if(current!==2){
      pickup.cancelPending();
      dropoff.cancelPending();
      gateMap.closeHidden();
    }
    if(focus){
      const heading=$('[data-step-h]',steps[current]);
      heading.focus({preventScroll:true});
      heading.scrollIntoView({block:'start'});
    }
  }
  function advance(){
    const errors=checks[current](new FormData(form));
    if(!showErrors(current,errors,true))return;
    completed.add(current);
    go(current+1);
  }

  for(const button of $$('[data-next]',form))button.addEventListener('click',advance);
  for(const button of $$('[data-prev]',form))button.addEventListener('click',()=>go(current-1));
  for(const button of [...$$('[data-step-h]',form),...stepLinks]){
    button.addEventListener('click',()=>go(Number(button.dataset.stepH||button.dataset.pl)-1));
  }
  form.addEventListener('input',()=>{
    updateSummary();
    if($('.bad',steps[current]))showErrors(current,checks[current](new FormData(form)));
  });
  form.addEventListener('change',updateSummary);
  form.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||current===4||event.target.matches('textarea, button, [type="date"]')||event.target.closest('.gate'))return;
    if(event.target.matches('input')){
      event.preventDefault();
      advance();
    }
  });

  summaryOpener.addEventListener('click',()=>{
    mobileTicket.append(ticket);
    mobileSummary.showModal();
    $('[data-sum-close]').focus();
  });
  $('[data-sum-close]').addEventListener('click',()=>mobileSummary.close());
  mobileSummary.addEventListener('close',()=>{
    desktopSummary.prepend(ticket);
    if(summaryViewport.matches)summaryOpener.focus();
  });
  summaryViewport.addEventListener('change',()=>{if(mobileSummary.open)mobileSummary.close();});

  function showConfirmation(booking,reference){
    const s=stay(new FormData(form));
    const space=spaceLabel(s.space);
    const receipt={
      '[data-d-r1]':s.dates,
      '[data-d-r2]':space,
      '[data-d-r3]':transportLabel(),
      '[data-d-r4]':rupees(s.total)+(s.hasPackageRate?' · 30-day rate':''),
      '[data-d-space]':space,
      '[data-d-sub]':s.space==='yes'?'24/7 CCTV':'Dog boarding',
      '[data-np-date]':s.dates,
      '#reference':reference
    };
    for(const [selector,value] of Object.entries(receipt))$(selector,complete).textContent=value;
    $('[data-np-name]',plaque).textContent=booking.petName;
    formView.hidden=true;
    complete.hidden=false;
    document.body.classList.add('sent');
    setPlaqueName(plaque,booking.petName);
    complete.focus({preventScroll:true});
    complete.scrollIntoView({block:'start'});
  }

  $('[data-restart]',complete).addEventListener('click',()=>{
    form.reset();
    pickup.reset();
    dropoff.reset();
    completed.clear();
    challenge=null;
    submit.disabled=true;
    if(window.turnstile&&turnstileId!==null)window.turnstile.reset(turnstileId);
    requestId=crypto.randomUUID();
    complete.hidden=true;
    formView.hidden=false;
    document.body.classList.remove('sent');
    displayTransport();
    go(0);
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(sending||formView.hidden)return;
    if(current!==4){advance();return;}
    if(!challenge)return;
    const data=new FormData(form);
    for(let index=0;index<steps.length;index++){
      const errors=checks[index](data);
      if(Object.keys(errors).length){
        go(index,{focus:false});
        showErrors(index,errors,true);
        return;
      }
    }
    message.hidden=true;
    const booking=payload();
    sending=true;
    submit.disabled=true;
    submit.setAttribute('aria-busy','true');
    sendLabel.textContent='Sending request';
    try{
      const response=await fetch('/api/book',{
        method:'POST',credentials:'omit',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({booking,turnstileToken:challenge})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error||'The request could not be sent.');
      showConfirmation(booking,body.reference||'');
    }catch(error){
      showMessage(error.message||'Network error. Check your connection and try again.');
      challenge=null;
      if(window.turnstile&&turnstileId!==null)window.turnstile.reset(turnstileId);
    }finally{
      sending=false;
      submit.removeAttribute('aria-busy');
      sendLabel.textContent='Send booking request';
      submit.disabled=challenge===null||formView.hidden;
    }
  });

  const turnstile=document.getElementById('turnstile');
  displayTransport();
  renderSteps();
  fetch('/api/book/config',{credentials:'omit',cache:'no-store'}).then(response=>{
    if(!response.ok)throw new Error('Not available');
    return response.json();
  }).then(config=>{
    if(config.enabled!==true||typeof config.siteKey!=='string')return;
    if(!window.turnstile)throw new Error('Security check unavailable');
    turnstile.hidden=false;
    turnstileId=window.turnstile.render(turnstile,{
      sitekey:config.siteKey,
      action:'apex-booking',
      callback(token){challenge=token;submit.disabled=sending||formView.hidden;},
      'expired-callback'(){challenge=null;submit.disabled=true;},
      'error-callback'(){
        challenge=null;submit.disabled=true;
        showMessage('The security check could not load. Reload and try again.');
      }
    });
    preview.hidden=true;
    submit.removeAttribute('aria-describedby');
  }).catch(()=>{
    turnstile.hidden=true;
    $('[data-booking-availability]',preview).textContent='Online requests are temporarily unavailable.';
  });
})();
