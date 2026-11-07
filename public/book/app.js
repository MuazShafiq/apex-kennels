(function(){
  'use strict';
  const form=document.getElementById('booking');
  const transport=document.getElementById('transport');
  const mapsLink=document.getElementById('maps-link');
  const status=document.getElementById('coordinate-status');
  const selectedLink=document.getElementById('selected-location-link');
  const message=document.getElementById('message');
  const submit=document.getElementById('submit');
  const preview=document.getElementById('preview');
  const SERVICE_BOUNDS=[[72.81,33.43],[73.30,33.84]];
  const requestId=crypto.randomUUID();
  const traitNames=['friendly','fears','climber','foodSensitivities','barksExcessively','allergies','biteHistory','medicalConditions'];
  let point=null,challenge=null,turnstileId=null,lookupVersion=0,lookupTimer=null;

  function showMessage(text,bad){
    message.textContent=text;
    message.className=bad?'message error':'message';
    message.hidden=false;
  }
  function transportChoice(){
    return form.querySelector('input[name="transportChoice"]:checked')?.value||'none';
  }
  function selectedTransport(){return transportChoice()!=='none';}
  function inServiceArea(latitude,longitude){
    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&
      latitude>=SERVICE_BOUNDS[0][1]&&latitude<=SERVICE_BOUNDS[1][1]&&
      longitude>=SERVICE_BOUNDS[0][0]&&longitude<=SERVICE_BOUNDS[1][0];
  }
  function unsetPoint(text){
    point=null;
    selectedLink.hidden=true;
    selectedLink.removeAttribute('href');
    status.textContent=text||'No location selected';
  }
  function putPoint(latitude,longitude,source){
    if(!inServiceArea(latitude,longitude)){
      unsetPoint('Pickup and drop-off are available only in Islamabad and Rawalpindi.');
      return false;
    }
    point={latitude:Math.round(latitude*1e7)/1e7,
      longitude:Math.round(longitude*1e7)/1e7};
    status.textContent=source+' location added';
    selectedLink.href='https://www.google.com/maps/search/?api=1&query='+
      encodeURIComponent(point.latitude+','+point.longitude);
    selectedLink.hidden=false;
    return true;
  }
  function displayTransport(){
    transport.hidden=!selectedTransport();
  }
  form.querySelectorAll('input[name="transportChoice"]').forEach(el=>{
    el.addEventListener('change',displayTransport);
  });
  async function resolveMapsLink(value,version){
    if(!value)return;
    try{
      const response=await fetch('/api/book/location',{
        method:'POST',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({link:value})
      });
      if(version!==lookupVersion)return;
      const data=await response.json();
      if(version!==lookupVersion)return;
      if(!response.ok){
        unsetPoint(data?.error||'That link has no precise location. Share a dropped pin in Google Maps.');
        return;
      }
      putPoint(data.latitude,data.longitude,'Google Maps');
    }catch{
      if(version===lookupVersion)
        unsetPoint('Could not read that link. Try pasting it again.');
    }
  }
  function handleLinkInput(){
    lookupVersion++;
    clearTimeout(lookupTimer);
    const value=mapsLink.value.trim();
    unsetPoint(value?'Reading location link…':'No location selected');
    if(!value)return;
    const version=lookupVersion;
    lookupTimer=setTimeout(()=>resolveMapsLink(value,version),500);
  }
  mapsLink.addEventListener('input',handleLinkInput);
  // Mobile paste sometimes fires an input event asynchronously.
  mapsLink.addEventListener('change',()=>{
    if(mapsLink.value.trim() && !point)handleLinkInput();
  });
  document.getElementById('locate').addEventListener('click',function(){
    lookupVersion++;
    clearTimeout(lookupTimer);
    mapsLink.value='';
    if(!navigator.geolocation){
      unsetPoint('Device location is unavailable. Use a Google Maps link.');
      return;
    }
    const version=lookupVersion;
    unsetPoint('Finding your location…');
    navigator.geolocation.getCurrentPosition(function(result){
      if(version!==lookupVersion)return;
      putPoint(result.coords.latitude,result.coords.longitude,'Current');
    },function(){
      if(version===lookupVersion)
        unsetPoint('Location permission was not granted. Use a Google Maps link instead.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });

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
    if(needsTransport&&!point){
      mapsLink.focus();
      throw new Error('Use your current location or paste a Google Maps location link.');
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
        ...point,service:choice,customerConfirmed:true
      };
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