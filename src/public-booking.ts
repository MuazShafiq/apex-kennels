import {parseIntake,type IntakeRequest} from './intake.ts';

/** Public request cannot supply prices, state transitions, or arbitrary fields. */
export function parsePublicBookingEnvelope(value:unknown):{
  booking:IntakeRequest;turnstileToken:string
}{
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('Invalid booking request');
  const request=value as Record<string,unknown>;
  if(Object.keys(request).sort().join(',')!=='booking,turnstileToken')
    throw new Error('Unexpected booking request fields');
  const token=request.turnstileToken;
  if(typeof token!=='string'||token.length<1||token.length>2048||
     /[\u0000-\u001f\u007f]/.test(token))throw new Error('Invalid security token');
  return {booking:parseIntake(request.booking,'website'),turnstileToken:token};
}

export async function verifyBookingChallenge(
  token:string,
  secret:string,
  hostname:string,
  fetcher:typeof fetch=fetch
):Promise<boolean>{
  if(!token||token.length>2048||!secret||!hostname)return false;
  const body=new URLSearchParams({secret,response:token});
  try{
    const result=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:body.toString(),
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(6500)
    });
    if(!result.ok)return false;
    const data=await result.json() as Record<string,unknown>;
    return data.success===true && data.hostname===hostname && data.action==='apex-booking';
  }catch{return false;}
}
