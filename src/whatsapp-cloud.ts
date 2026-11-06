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
  constructor(status:number){super('WhatsApp request failed');this.status=status;}
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
      name:template,language:{code:'en'},
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
  if(!response.ok)throw new WhatsappError(response.status);
  let data:unknown;
  try{
    const raw=await response.text();
    if(raw.length>10000)throw new Error('Unexpected API response');
    data=JSON.parse(raw);
  }catch{throw new WhatsappError(502);}
  const messages=data&&typeof data==='object'&&'messages' in data
    ?(data as {messages:unknown}).messages:null;
  if(!Array.isArray(messages)||typeof messages[0]?.id!=='string'||
     !/^wamid\.[A-Za-z0-9._-]{8,300}$/.test(messages[0].id))
    throw new WhatsappError(502);
  return {messageId:messages[0].id,accepted:true};
}
export function bookingAlertTemplateValues(reference:string):string[]{
  // Deliberately no customer's private phone, vet, medication or health data.
  if(!/^[a-f0-9]{8}$/i.test(reference))throw new Error('Invalid booking reference');
  return [reference.toUpperCase()];
}
