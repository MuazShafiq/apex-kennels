/* Owner-only data arrives in the protected HTML; this static script contains no private values. */
(()=>{'use strict';
const root=document.getElementById('owner-editor');if(!root)return;
const byId=id=>document.getElementById(id),saved=JSON.parse(byId('editor-current').value),defaults=JSON.parse(byId('editor-defaults').value);
let quote=structuredClone(saved),undo=[],dirty=false,busy=false,pendingAction='edit';
const approvalButtons=()=>[...document.querySelectorAll('form[action="/staff/invoices/approve"] button')];
const status=message=>{byId('edit-status').textContent=message;};
function error(message){const e=byId('edit-error');e.textContent=message;e.hidden=false;e.focus();}
function remember(){pendingAction='edit';undo.push(structuredClone(quote));if(undo.length>40)undo.shift();dirty=true;approvalButtons().forEach(b=>b.disabled=true);status('Unsaved invoice changes. Save before approval.');}
function button(label,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',run);return b;}
function input(row,key,label,type='text'){
 const wrap=document.createElement('label');wrap.textContent=label;
 const field=document.createElement('input');field.type=type;field.value=row[key];field.required=true;
 if(type==='number'){field.min=key==='quantity'?'1':'0';field.step='1';field.inputMode='numeric';}else field.maxLength=160;
 field.addEventListener('input',()=>{remember();row[key]=type==='number'?(field.value===''?NaN:Number(field.value)):field.value;preview();});wrap.append(field);return wrap;
}
function move(rows,index,step){if(index+step<0||index+step>=rows.length)return;remember();[rows[index],rows[index+step]]=[rows[index+step],rows[index]];render();}
function renderRows(rows,target,discount){
 const box=byId(target);box.replaceChildren();rows.forEach((row,index)=>{
  const item=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=(discount?'Discount ':'Line ')+(index+1);item.append(legend,input(row,'label','Description'));
  if(discount)item.append(input(row,'amountPkr','Discount amount (PKR)','number'));else item.append(input(row,'quantity','Quantity','number'),input(row,'unitPricePkr','Unit price (PKR)','number'));
  const up=button('Move '+(discount?'discount':'line')+' '+(index+1)+' up',()=>move(rows,index,-1)),down=button('Move '+(discount?'discount':'line')+' '+(index+1)+' down',()=>move(rows,index,1));up.disabled=index===0;down.disabled=index===rows.length-1;
  item.append(up,down,button('Delete '+(discount?'discount':'line')+' '+(index+1),()=>{remember();rows.splice(index,1);render();}));box.append(item);
 });
}
function preview(){
 const box=byId('invoice-live-preview');box.replaceChildren();let subtotal=0,discount=0,valid=true;
 const money=n=>Number.isSafeInteger(n)&&n>=0;
 for(const row of quote.lines){const amount=row.quantity*row.unitPricePkr;if(!Number.isSafeInteger(row.quantity)||row.quantity<1||!money(row.unitPricePkr)||!money(amount)||!row.label.trim()||row.label.length>160)valid=false;subtotal+=amount;const p=document.createElement('p');p.textContent=row.label+' · '+row.quantity+' × PKR '+row.unitPricePkr+' = PKR '+amount;box.append(p);}
 for(const row of quote.discounts){if(!money(row.amountPkr)||!row.label.trim()||row.label.length>160)valid=false;discount+=row.amountPkr;const p=document.createElement('p');p.textContent=row.label+' · − PKR '+row.amountPkr;box.append(p);}
 const total=subtotal-discount;if(!money(subtotal)||!money(discount)||!money(total))valid=false;
 const p=document.createElement('p');p.textContent=valid?'Final total: PKR '+total.toLocaleString('en-PK')+' · Variance from calculation: PKR '+(total-defaults.totalPkr).toLocaleString('en-PK'):'Enter valid whole amounts. Discounts must not exceed the subtotal.';box.append(p);
 byId('save-invoice-edit').disabled=busy||!valid||!dirty;byId('undo-invoice-edit').disabled=busy||!undo.length;
}
function render(){renderRows(quote.lines,'invoice-rows',false);renderRows(quote.discounts,'invoice-discounts',true);preview();}
async function save(action=pendingAction){
 if(busy)return;busy=true;preview();byId('edit-error').hidden=true;status('Saving invoice changes…');
 try{const result=await fetch('/staff/invoices/edit',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:root.dataset.booking,revision:root.dataset.revision,rows:JSON.stringify({lines:quote.lines,discounts:quote.discounts}),editAction:action,confirmed:'true'})});const data=await result.json();if(!result.ok)throw new Error(data.error||'Could not save invoice changes');location.reload();}
 catch(e){error(e.message||'Could not save. Your unsaved edits are still here.');status('Not saved. Your edits are preserved.');busy=false;preview();}
}
byId('add-invoice-row').onclick=()=>{if(quote.lines.length>=60)return error('Use at most 60 invoice lines.');remember();quote.lines.push({label:'Custom charge',quantity:1,unitPricePkr:0});render();};
byId('add-invoice-discount').onclick=()=>{if(quote.discounts.length>=20)return error('Use at most 20 discounts.');remember();quote.discounts.push({label:'Owner discount',amountPkr:0});render();};
byId('undo-invoice-edit').onclick=()=>{if(!undo.length)return;quote=undo.pop();pendingAction='edit';dirty=true;render();};
byId('reset-invoice-edit').onclick=()=>{remember();quote=structuredClone(defaults);pendingAction='reset';render();status('Calculated defaults restored locally. Save to keep them.');};
byId('save-invoice-edit').onclick=()=>save();
if(byId('undo-saved-invoice-edit'))byId('undo-saved-invoice-edit').onclick=()=>{if(!dirty||confirm('Discard unsaved changes and undo the last saved edit?'))save('undo');};
addEventListener('beforeunload',e=>{if(dirty&&!busy){e.preventDefault();e.returnValue='';}});
render();
})();
