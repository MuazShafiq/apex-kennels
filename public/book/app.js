(function(){
  'use strict';
  const form=document.getElementById('booking');
  const transport=document.getElementById('transport');
  const placeSearch=document.getElementById('place-search');
  const placeResults=document.getElementById('place-results');
  const searchStatus=document.getElementById('search-status');
  const locationStatus=document.getElementById('coordinate-status');
  const message=document.getElementById('message');
  const submit=document.getElementById('submit');
  const preview=document.getElementById('preview');
  let map=null,marker=null,point=null,challenge=null,turnstileId=null;
  let searchTimer=null,searchAbort=null,searchVersion=0;
  const requestId=crypto.randomUUID();
  const traitNames=['friendly','fears','climber','foodSensitivities','barksExcessively','allergies','biteHistory','medicalConditions'];

  function showMessage(text,bad){
    message.textContent=text;
    message.className=bad?'message error':'message';
    message.hidden=false;
  }
  function transportChoice(){
    return form.querySelector('input[name="transportChoice"]:checked')?.value||'none';
  }
  function selectedTransport(){return transportChoice()!=='none';}
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
    locationStatus.textContent='Location chosen · Drag the pin to adjust';
  }
  function displayTransport(){
    const required=selectedTransport();
    transport.hidden=!required;
    if(!required){
      closeSuggestions();
      if(searchAbort)searchAbort.abort();
    }
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
      map.on('click',function(e){
        putPoint(e.lngLat.lat,e.lngLat.lng);
        placeSearch.value='';
        searchStatus.textContent='Pin placed on the map.';
        closeSuggestions();
      });
    }
    if(map&&required)map.resize();
  }
  form.querySelectorAll('input[name="transportChoice"]').forEach(function(el){
    el.addEventListener('change',displayTransport);
  });
  function closeSuggestions(){
    placeResults.hidden=true;
    placeResults.replaceChildren();
    placeSearch.setAttribute('aria-expanded','false');
  }
  function renderPlaces(items){
    closeSuggestions();
    if(!items.length){
      searchStatus.textContent='No matching places. Try another name or choose a point on the map.';
      return;
    }
    const list=document.createDocumentFragment();
    items.forEach(function(place){
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('role','option');
      button.textContent=place.label;
      button.addEventListener('click',function(){
        putPoint(place.latitude,place.longitude);
        if(map)map.flyTo({center:[place.longitude,place.latitude],zoom:16});
        placeSearch.value=place.label;
        searchStatus.textContent='Found your area. Move the pin to your gate if needed.';
        closeSuggestions();
      });
      list.append(button);
    });
    placeResults.append(list);
    placeResults.hidden=false;
    placeSearch.setAttribute('aria-expanded','true');
    searchStatus.textContent=items.length+' matching place'+(items.length===1?'':'s');
  }
  async function queryPlaces(query,version){
    if(searchAbort)searchAbort.abort();
    const controller=new AbortController();
    searchAbort=controller;
    try{
      const response=await fetch('/api/book/places?q='+encodeURIComponent(query),{
        credentials:'omit',signal:controller.signal,cache:'no-store'
      });
      if(version!==searchVersion)return;
      if(!response.ok)throw new Error('Search unavailable');
      const data=await response.json();
      if(version!==searchVersion)return;
      if(!Array.isArray(data.items))throw new Error('Invalid search results');
      renderPlaces(data.items);
    }catch(error){
      if(version!==searchVersion||error.name==='AbortError')return;
      closeSuggestions();
      searchStatus.textContent='Search is unavailable. You can still tap the map to choose your location.';
    }
  }
  placeSearch.addEventListener('input',function(){
    const query=placeSearch.value.trim();
    searchVersion++;
    clearTimeout(searchTimer);
    if(searchAbort)searchAbort.abort();
    closeSuggestions();
    if(query.length<3){
      searchStatus.textContent='Type at least 3 characters, or tap the map.';
      return;
    }
    searchStatus.textContent='Searching…';
    const version=searchVersion;
    searchTimer=setTimeout(function(){queryPlaces(query,version);},400);
  });
  placeSearch.addEventListener('keydown',function(event){
    if(event.key==='Escape')closeSuggestions();
    if(event.key==='ArrowDown'&&!placeResults.hidden){
      const first=placeResults.querySelector('button');
      if(first){event.preventDefault();first.focus();}
    }
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('.place-search'))closeSuggestions();
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
    const choice=transportChoice();
    const needsTransport=choice!=='none';
    if(needsTransport&&!point){
      placeSearch.focus();
      throw new Error('Search for a location or drop a pin on the map.');
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