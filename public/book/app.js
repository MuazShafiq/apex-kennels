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
  // Each location owns its own lookup timer and version so editing the
  // pickup pin cannot overwrite an in-flight drop-off pin (or vice versa).
  function locationControl(prefix){
    const suffix=prefix==='dropoff-'?'dropoff':'primary';
    const input=document.getElementById(prefix+'maps-link');
    const status=document.getElementById(prefix+'coordinate-status');
    const link=document.getElementById(prefix+'selected-location-link');
    const locate=document.getElementById(prefix+'locate');
    const search=document.getElementById(prefix+'place-search');
    const results=document.getElementById(prefix+'place-results');
    const searchStatus=document.getElementById(prefix+'search-status');
    const gateReview=document.getElementById(prefix+'gate-review');
    const gateLat=document.getElementById(prefix+'gate-latitude');
    const gateLon=document.getElementById(prefix+'gate-longitude');
    const confirmGate=document.getElementById(prefix+'confirm-gate');
    let point=null,version=0,timer=null,searchTimer=null,controller=null,active=-1;
    function closeResults(){results.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
    function stopSearch(){clearTimeout(searchTimer);controller?.abort();closeResults();}
    function candidate(item){
      version++;clearTimeout(timer);stopSearch();input.value='';
      clear('Confirm or adjust the vehicle gate before continuing.');
      search.value=item.label;gateReview.hidden=false;
      gateLat.value=item.latitude;gateLon.value=item.longitude;
      link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(item.latitude+','+item.longitude);link.hidden=false;
      searchStatus.textContent='Place selected. Confirm the exact gate below.';
      gateLat.focus();
    }
    search.addEventListener('input',()=>{
      version++;clearTimeout(timer);stopSearch();clear();gateReview.hidden=true;gateLat.value='';gateLon.value='';input.value='';
      const query=search.value.trim(),requestVersion=version;
      results.replaceChildren();
      if(query.length<3){searchStatus.textContent='Type at least 3 characters. GPS and pasted gate pins also work.';return;}
      searchStatus.textContent='Searching…';
      searchTimer=setTimeout(async()=>{
        controller=new AbortController();
        try{
          const response=await fetch('/api/book/search',{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
          const data=await response.json();if(requestVersion!==version)return;
          if(!response.ok)throw new Error(data.error||'Search unavailable. Use GPS or paste your gate pin.');
          const items=Array.isArray(data.results)?data.results.filter(x=>typeof x.label==='string'&&inServiceArea(x.latitude,x.longitude)):[];
          searchStatus.textContent=items.length?'Choose a place, then confirm its vehicle gate. Powered by Geoapify / OpenStreetMap.':'No matching local places. Add a society, phase or city, or paste your exact gate pin.';
          for(const [index,item] of items.entries()){
            const li=document.createElement('li'),button=document.createElement('button');
            li.setAttribute('role','presentation');button.type='button';button.id=prefix+'place-option-'+index;
            button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.className='secondary';
            button.textContent=item.label+(item.area&&!item.label.includes(item.area)?' — '+item.area:'');
            button.addEventListener('click',()=>candidate(item));li.append(button);results.append(li);
          }
          results.hidden=!items.length;search.setAttribute('aria-expanded',String(!!items.length));
        }catch(error){if(requestVersion===version&&error.name!=='AbortError')searchStatus.textContent=error.message||'Search unavailable. Use GPS or paste your gate pin.';}
      },400);
    });
    search.addEventListener('keydown',event=>{
      const options=results.querySelectorAll('button');
      if(event.key==='Escape'){closeResults();return;}
      if(results.hidden||!options.length)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
        options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
        search.setAttribute('aria-activedescendant',options[active].id);
      }else if(event.key==='Enter'){event.preventDefault();if(active>=0)options[active].click();}
    });
    for(const field of [gateLat,gateLon])field.addEventListener('input',()=>{point=null;status.textContent='Coordinates changed. Confirm the vehicle gate again.';});
    confirmGate.addEventListener('click',()=>{
      if(!gateLat.value||!gateLon.value){clear('Enter both gate coordinates.');return;}
      update(Number(gateLat.value),Number(gateLon.value),'Confirmed gate');
    });
    function clear(text){
      point=null;
      link.hidden=true;
      link.removeAttribute('href');
      status.textContent=text||'No location selected';
    }
    function update(latitude,longitude,source){
      if(!inServiceArea(latitude,longitude)){
        clear('Pickup and drop-off are available only in Islamabad and Rawalpindi.');
        return;
      }
      point={latitude:Math.round(latitude*1e7)/1e7,
        longitude:Math.round(longitude*1e7)/1e7};
      status.textContent=source==='Coordinates'?'Exact pin coordinates added':source+' location added';
      link.href='https://www.google.com/maps/search/?api=1&query='+
        encodeURIComponent(point.latitude+','+point.longitude);
      link.hidden=false;
    }
    async function resolve(value,requestVersion){
      try{
        const response=await fetch('/api/book/location',{
          method:'POST',credentials:'omit',cache:'no-store',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({link:value})
        });
        if(requestVersion!==version)return;
        const data=await response.json();
        if(requestVersion!==version)return;
        if(!response.ok){
          clear(data?.error||'That link has no precise location. Share a dropped pin in Google Maps.');
          return;
        }
        const coordinates=/^-?\d{1,2}(?:\.\d+)?,\s*-?\d{1,3}(?:\.\d+)?$/.test(value.trim());
        update(data.latitude,data.longitude,coordinates?'Coordinates':'Google Maps');
      }catch{
        if(requestVersion===version)clear('Could not read that link. Try pasting it again.');
      }
    }
    function inputChanged(){
      version++;clearTimeout(timer);stopSearch();gateReview.hidden=true;gateLat.value='';gateLon.value='';search.value='';
      const value=input.value.trim();
      clear(value?'Reading location link…':'No location selected');
      if(value)timer=setTimeout(()=>resolve(value,version),500);
    }
    input.addEventListener('input',inputChanged);
    input.addEventListener('change',()=>{if(input.value.trim()&&!point)inputChanged()});
    locate.addEventListener('click',()=>{
      version++;clearTimeout(timer);stopSearch();gateReview.hidden=true;gateLat.value='';gateLon.value='';search.value='';input.value='';
      if(!navigator.geolocation){
        clear('Device location is unavailable. Use a Google Maps link.');return;
      }
      const requestVersion=version;
      clear('Finding your location…');
      navigator.geolocation.getCurrentPosition(result=>{
        if(requestVersion===version)update(result.coords.latitude,result.coords.longitude,'Current');
      },()=>{
        if(requestVersion===version)
          clear('Location permission was not granted. Use a Google Maps link instead.');
      },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
    });
    return {
      point:()=>point,
      focus:()=>gateReview.hidden?search.focus():confirmGate.focus(),
      reset:()=>{version++;clearTimeout(timer);stopSearch();search.value='';gateReview.hidden=true;gateLat.value='';gateLon.value='';input.value='';clear(suffix==='dropoff'?'No drop-off location selected':'No location selected');}
    };
  }
  const pickup=locationControl('');
  const dropoff=locationControl('dropoff-');
  function displayTransport(){
    const pickupOn=pickupRequested.checked,dropoffOn=dropoffRequested.checked;
    pickupPanel.hidden=!pickupOn;
    dropoffReuse.hidden=!(pickupOn&&dropoffOn);
    dropoffPanel.hidden=!dropoffOn||(pickupOn&&sameDropoff.checked);
    pickupRequested.setAttribute('aria-expanded',String(pickupOn));
    dropoffRequested.setAttribute('aria-expanded',String(!dropoffPanel.hidden));
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
      throw new Error('Select the '+(choice==='dropoff'?'drop-off':'pickup')+' location using Google Maps or coordinates.');
    }
    if(choice==='both'&&!sameDropoff.checked&&!dropoff.point()){
      dropoff.focus();
      throw new Error('Select the separate drop-off location using Google Maps or coordinates.');
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
