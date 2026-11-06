/**
 * Cloudflare Access identity fallback for Workers with Static Assets.
 * The asset router does not propagate ctx.access, but forwards the Access JWT.
 * Verify the signature against this application's explicitly configured issuer,
 * then require the exact audience and email allowlist (in the caller).
 */
type JwtHeader={alg?:unknown;kid?:unknown;typ?:unknown};
type JwtClaims={iss?:unknown;aud?:unknown;email?:unknown;exp?:unknown;nbf?:unknown;iat?:unknown};
type Jwk={kty?:unknown;kid?:unknown;alg?:unknown;use?:unknown;n?:unknown;e?:unknown};
type Jwks={keys?:unknown};
type PublicKeyCache={issuer:string;until:number;keys:Jwk[]};
let cached:PublicKeyCache|undefined;

function decodeSegment(segment:string,maxLength:number):Record<string,unknown>|null {
  if(segment.length<2||segment.length>maxLength||!/^[A-Za-z0-9_-]+$/.test(segment))return null;
  try {
    const data=Uint8Array.from(atob(segment.replace(/-/g,'+').replace(/_/g,'/')+
      '='.repeat((4-segment.length%4)%4)),x=>x.charCodeAt(0));
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)) as unknown;
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)
      ?parsed as Record<string,unknown>:null;
  }catch{return null;}
}
function bytes(segment:string):Uint8Array|null{
  if(!segment||segment.length>1024||!/^[A-Za-z0-9_-]+$/.test(segment))return null;
  try {return Uint8Array.from(atob(segment.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-segment.length%4)%4)),x=>x.charCodeAt(0));}
  catch{return null;}
}
function trustedIssuer(value:string|undefined):string|null{
  if(!value)return null;
  const v=value.trim().replace(/\/$/,'');
  // Do not let a caller-controlled JWT issuer choose whose signing keys we trust.
  return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(v)?v:null;
}
async function loadKeys(issuer:string,fetcher:typeof fetch,force=false):Promise<Jwk[]>{
  if(!force&&cached?.issuer===issuer&&Date.now()<cached.until)return cached.keys;
  const response=await fetcher(issuer+'/cdn-cgi/access/certs',{
    method:'GET',redirect:'manual',cache:'no-store',
    headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(4500)
  });
  if(!response.ok)return [];
  const text=await response.text();
  if(text.length>65536)return [];
  const parsed=JSON.parse(text) as Jwks;
  if(!parsed||!Array.isArray(parsed.keys))return [];
  const keys=(parsed.keys as unknown[]).filter((key):key is Jwk=>
    !!key&&typeof key==='object'&&!Array.isArray(key)&&
    (key as Jwk).kty==='RSA'&&typeof (key as Jwk).kid==='string'&&
    typeof (key as Jwk).n==='string'&&typeof (key as Jwk).e==='string'&&
    ((key as Jwk).alg===undefined||(key as Jwk).alg==='RS256')&&
    ((key as Jwk).use===undefined||(key as Jwk).use==='sig')
  ).slice(0,20);
  if(keys.length)cached={issuer,keys,until:Date.now()+5*60_000};
  return keys;
}

export async function verifiedAccessEmail(
  token:string|null,configuredIssuer:string|undefined,expectedAudience:string,
  fetcher:typeof fetch=fetch
):Promise<string|null>{
  const issuer=trustedIssuer(configuredIssuer);
  if(!issuer||!token||token.length>8192||expectedAudience.length<10)return null;
  const parts=token.split('.');
  if(parts.length!==3)return null;
  const header=decodeSegment(parts[0],2048) as JwtHeader|null;
  const claims=decodeSegment(parts[1],6000) as JwtClaims|null;
  const signature=bytes(parts[2]);
  if(!header||!claims||!signature||signature.length<128||
     header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128)
    return null;
  if(claims.iss!==issuer)return null;
  if(claims.aud!==expectedAudience&&
    !(Array.isArray(claims.aud)&&claims.aud.includes(expectedAudience)))return null;
  const now=Math.floor(Date.now()/1000);
  if(typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||claims.exp<=now)return null;
  if(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>now+30))return null;
  if(claims.iat!==undefined&&(typeof claims.iat!=='number'||claims.iat>now+30))return null;
  if(typeof claims.email!=='string'||!claims.email.trim()||claims.email.length>254)return null;
  try{
    let keys=await loadKeys(issuer,fetcher);
    let jwk=keys.find(x=>x.kid===header.kid);
    if(!jwk){
      keys=await loadKeys(issuer,fetcher,true); // normal Cloudflare key rotation
      jwk=keys.find(x=>x.kid===header.kid);
    }
    if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk as JsonWebKey,
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,
      signature as BufferSource,new TextEncoder().encode(parts[0]+'.'+parts[1]));
    return valid?claims.email.trim().toLowerCase():null;
  }catch{return null;}
}
