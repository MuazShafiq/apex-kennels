(function(){
  'use strict';
  const form=document.getElementById('booking');
  const transport=document.getElementById('transport');
  const service=form.elements.namedItem('service');
  const gate=document.getElementById('confirm-gate');
  const locationStatus=document.getElementById('coordinate-status');
  const message=document.getElementById('message');
  const submit=document.getElementById('submit');
  const preview=document.getElementById('preview');
  let map=null,marker=null,point=null,challenge=null,turnstileId=null;
  const requestId=crypto.randomUUID();
  const traitNames=['friendly','fears','climber','foodSensitivities','barksExcessively','allergies','biteHistory','medicalConditions'];

  function showMessage(text,bad){
    message.textContent=text;
    message.className=bad?'message error':'message';
    message.hidden=false;
  }
  function selectedTransport(){
    return form.querySelector('input[name="pickupDropoffRequested"]:checked')?.value==='yes';
  }
  function putPoint(latitude,longitude){
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||
       latitude<23||latitude>38||longitude<60||longitude>78){
      showMessage('Please choose a location in Pakistan.',true);return;
    }
    point={latitude:Math.round(latitude*1e7)/1e7,longitude:Math.round(longitude*1e7)/1e7};
    if(!marker && map){
      marker=new maplibregl.Marker({draggable:true,color:'#b86c45'})
        .setLngLat([point.longitude,point.latitude]).addTo(map);
      marker.on('dragend',function(){
        const p=marker.getLngLat();putPoint(p.lat,p.lng);
      });
    }else if(marker){
      marker.setLngLat([point.longitude,point.latitude]);
    }
    locationStatus.textContent='Pin: '+point.latitude.toFixed(6)+', '+point.longitude.toFixed(6);
    gate.checked=false;
  }
  function displayTransport(){
    const required=selectedTransport();
    transport.hidden=!required;
    service.required=required;
    gate.required=required;
    if(required&&!map){
      if(!window.maplibregl){
        showMessage('Map could not load. Please try again when connected.',true);
        return;
      }
      map=new maplibregl.Map({
        container:'map',
        style:'https://tiles.openfreemap.org/styles/liberty',
        center:[73.0479,33.6844],
        zoom:10
      });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('click',function(e){putPoint(e.lngLat.lat,e.lngLat.lng);});
    }
    if(map&&required)map.resize();
  }
  form.querySelectorAll('input[name="pickupDropoffRequested"]').forEach(function(el){
    el.addEventListener('change',displayTransport);
  });
  document.getElementById('locate').addEventListener('click',function(){
    if(!navigator.geolocation){
      showMessage('Location services are unavailable. Tap the map instead.',true);return;
    }
    navigator.geolocation.getCurrentPosition(function(result){
      const {latitude,longitude}=result.coords;
      putPoint(latitude,longitude);
      if(map&&point)map.flyTo({center:[point.longitude,point.latitude],zoom:16});
    },function(){
      showMessage('Location permission was not granted. Tap the map to place your pin.',true);
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
    const needsTransport=field(data,'pickupDropoffRequested')==='yes';
    if(needsTransport&&(!point||!gate.checked)){
      throw new Error('Tap the map and confirm the correct pickup or drop-off entrance.');
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
      termsAccepted:data.get('termsAccepted')==='on'
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
        ...point,service:field(data,'service'),customerConfirmed:true
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