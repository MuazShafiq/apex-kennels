/** Browser-only helpers. These never change the deployed picker or API. */
export async function waitForBrowser(page,predicate,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(await page.evaluate(predicate))return;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  throw Error('Browser state timed out: '+String(predicate));
}

export async function revealPinFallback(page,prefix=''){
  await page.locator('#'+prefix+'maps-link').evaluate(input=>{
    for(let parent=input.parentElement;parent;parent=parent.parentElement)
      if(parent.tagName==='DETAILS')parent.open=true;
  });
}

export async function confirmExactPin(page,value,prefix=''){
  await revealPinFallback(page,prefix);
  await page.locator('#'+prefix+'maps-link').fill(value);
  await page.locator('#'+prefix+'confirm-gate').waitFor({state:'visible'});
  await page.locator('#gate-picker').waitFor({state:'visible'});
  await page.locator('#map-fallback').click();
  await page.locator('#'+prefix+'confirm-gate').click();
  await page.locator('#'+prefix+'selected-location-link').waitFor({state:'visible'});
}

// Replaces only the locally hosted map-library script. The app, selection
// lifecycle and DOM remain real. Separate checks exercise real MapLibre.
export async function stubMapLibrary(page){
  await page.route('**/*maplibre*.js',route=>{
    if(route.request().url().includes('worker'))return route.fulfill({contentType:'application/javascript',body:''});
    return route.fulfill({contentType:'application/javascript',body:`
      window.__syntheticMaps=[];
      class SyntheticMap {
        constructor(options){
          this.options=options;this.center={lng:options.center[0],lat:options.center[1]};this.zoom=options.zoom;this.events={};
          this.touchZoomRotate={disableRotation(){}};
          this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;
          this.canvas.setAttribute('aria-label','Map');
          (typeof options.container==='string'?document.getElementById(options.container):options.container).append(this.canvas);
          this.canvas.addEventListener('keydown',event=>{
            if(event.key==='+'){event.preventDefault();this.zoom++;this.panTo([this.center.lng,this.center.lat]);return;}
            if(!event.key.startsWith('Arrow'))return;
            event.preventDefault();this.panTo([this.center.lng+(event.key==='ArrowRight'?.001:event.key==='ArrowLeft'?-.001:0),
              this.center.lat+(event.key==='ArrowUp'?.001:event.key==='ArrowDown'?-.001:0)]);
          });
          window.__syntheticMaps.push(this);setTimeout(()=>{this.emit('load');this.emit('idle');},0);
        }
        on(name,fn){(this.events[name]??=[]).push(fn);return this;}
        once(name,fn){const once=(...args)=>{this.off(name,once);fn(...args);};return this.on(name,once);}
        off(name,fn){this.events[name]=(this.events[name]??[]).filter(x=>x!==fn);return this;}
        emit(name,data={}){for(const fn of this.events[name]??[])fn(data);}
        getCenter(){return {...this.center};}
        getZoom(){return this.zoom;}
        getCanvas(){return this.canvas;}
        getContainer(){return this.canvas.parentElement;}
        loaded(){return true;}
        isStyleLoaded(){return true;}
        resize(){return this;}
        triggerRepaint(){setTimeout(()=>this.emit('idle'),0);return this;}
        addControl(){return this;}
        remove(){this.canvas.remove();}
        panTo(center){this.emit('movestart');this.center={lng:center[0],lat:center[1]};this.emit('move');this.emit('moveend');this.triggerRepaint();return this;}
        jumpTo(options){if(options.zoom!==undefined)this.zoom=options.zoom;return this.panTo(options.center);}
        easeTo(options){return this.panTo(options.center);}
        flyTo(options){return this.panTo(options.center);}
        setCenter(center){return this.panTo(center);}
        setMaxBounds(){return this;}
      }
      window.maplibregl={Map:SyntheticMap,NavigationControl:class{},AttributionControl:class{},supported:()=>true,
        setWorkerUrl(url){this.workerUrl=url;}};
    `});
  });
}

export async function moveSyntheticMap(page,latitude,longitude){
  await waitForBrowser(page,()=>window.__syntheticMaps?.length>0);
  await page.evaluate(({latitude,longitude})=>{
    const map=window.__syntheticMaps?.at(-1);
    if(!map)throw Error('Synthetic map was not constructed');
    map.jumpTo({center:[longitude,latitude],zoom:17});
  },{latitude,longitude});
}
