/**
 * Official Meta WhatsApp Cloud API adapter.
 * NO WhatsApp Web scraping, no implicit billing, no sends without an
 * approved template, verified opt-in, and explicit enablement.
 */
export type WhatsappConfig={
  accessToken:string;
  phoneNumberId:string;
  apiVersion:string;
};
export type WhatsappAccepted={messageId:string;accepted:true};
type Parameter={type:'text';text:string};
export class WhatsappError extends Error{
  readonly status:number;
  readonly kind:'failed'|'ambiguous';
  constructor(status:number,kind:'failed'|'ambiguous'='ambiguous'){super('WhatsApp request failed');this.status=status;this.kind=kind;}
}
export function normalizePakistanWhatsappPhone(raw:string):string{
  const cleaned=raw.trim().replace(/[\s()+-]/g,'');
  const digits=cleaned.startsWith('00')?cleaned.slice(2):cleaned;
  const canonical=digits.startsWith('03')?'92'+digits.slice(1):digits;
  if(!/^923[0-9]{9}$/.test(canonical))throw new Error('A valid Pakistani WhatsApp phone number is required');
  return canonical;
}
function safeTemplateName(name:string):string{
  if(!/^[a-z][a-z0-9_]{2,127}$/.test(name))throw new Error('Invalid approved template name');
  return name;
}
function param(value:string):Parameter{
  const text=value.trim().replace(/[\r\n\t]+/g,' ').slice(0,200);
  if(!text)throw new Error('Missing template parameter');
  return {type:'text',text};
}
function verifiedConfig(config:WhatsappConfig):void{
  if(!/^v\d{2}\.0$/.test(config.apiVersion))throw new Error('Invalid Graph API version');
  if(!/^\d{8,30}$/.test(config.phoneNumberId))throw new Error('Invalid WhatsApp phone ID');
  if(config.accessToken.length<30)throw new Error('Missing WhatsApp API token');
}
/** 200 response means Meta ACCEPTED submission; delivery is NOT verified. */
export async function sendApprovedTemplate(
  config:WhatsappConfig,to:string,name:string,bodyValues:string[],
  fetcher:typeof fetch=fetch
):Promise<WhatsappAccepted>{
  verifiedConfig(config);
  const phone=normalizePakistanWhatsappPhone(to);
  const template=safeTemplateName(name);
  if(bodyValues.length<1||bodyValues.length>6)throw new Error('Invalid template parameters');
  const payload={
    messaging_product:'whatsapp',to:phone,type:'template',
    template:{
      name:template,language:{code:'en_US'},
      components:[{type:'body',parameters:bodyValues.map(param)}]
    }
  };
  let response:Response;
  try{
    response=await fetcher(
      'https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId+'/messages',{
        method:'POST',
        headers:{Authorization:'Bearer '+config.accessToken,'Content-Type':'application/json'},
        body:JSON.stringify(payload),redirect:'manual',cache:'no-store',
        signal:AbortSignal.timeout(7000)
      });
  }catch{throw new WhatsappError(0);}
  if(!response.ok){
    let rejected=false;
    if(response.status>=400&&response.status<500&&response.status!==408){
      try{const data=await boundedMetaJson(response);const error=data.error as {code?:unknown;type?:unknown}|undefined;
        rejected=!data.messages&&!!error&&Number.isSafeInteger(error.code)&&typeof error.type==='string'&&error.type.length>0;
      }catch{/* No confirmed rejection. */}
    }
    throw new WhatsappError(response.status,rejected?'failed':'ambiguous');
  }
  let data:unknown;
  try{
    data=await boundedMetaJson(response);
  }catch{throw new WhatsappError(502);}
  const messages=data&&typeof data==='object'&&'messages' in data
    ?(data as {messages:unknown}).messages:null;
  if(!Array.isArray(messages)||typeof messages[0]?.id!=='string'||
     messages.length!==1||!/^wamid\.[A-Za-z0-9+/=_-]{8,500}$/.test(messages[0].id))
    throw new WhatsappError(502);
  return {messageId:messages[0].id,accepted:true};
}
export function bookingAlertTemplateValues(reference:string):string[]{
  // Deliberately no customer's private phone, vet, medication or health data.
  if(!/^[a-f0-9]{8}$/i.test(reference))throw new Error('Invalid booking reference');
  return [reference.toUpperCase()];
}

export async function boundedMetaJson(response:Response):Promise<Record<string,unknown>>{
  if(!response.body)throw new Error('Missing response');
  const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>16000)throw new Error('Oversized response');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const data:unknown=JSON.parse(new TextDecoder().decode(bytes));
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid response');
  return data as Record<string,unknown>;
}
