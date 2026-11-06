import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifiedAccessEmail} from './staff-access-jwt.ts';

const aud='synthetic-application-audience-123';
const iss='https://apex-synthetic-team.cloudflareaccess.com';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'fixture-key'};
const now=()=>Math.floor(Date.now()/1000);
const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=(claims:Record<string,unknown>,header:Record<string,unknown>={alg:'RS256',kid:'fixture-key'})=>{
  const data=encode(header)+'.'+encode(claims);
  return data+'.'+sign('sha256',Buffer.from(data),privateKey).toString('base64url');
};
const payload=(overrides:Record<string,unknown>={})=>({
  iss,aud,email:'STAFF@EXAMPLE.TEST',iat:now()-10,exp:now()+3600,...overrides
});
let jwksCalls=0;
const keys:typeof fetch=async(url,opts)=>{
  jwksCalls++;
  assert.equal(String(url),iss+'/cdn-cgi/access/certs');
  assert.equal(opts?.redirect,'manual');
  return new Response(JSON.stringify({keys:[jwk]}),{status:200});
};

test('cryptographically verifies configured Cloudflare issuer, audience and identity',async()=>{
  const value=await verifiedAccessEmail(token(payload()),iss,aud,keys);
  assert.equal(value,'staff@example.test');
  assert.ok(jwksCalls>0);
});

test('signature tampering, other audience/issuer and expired token all fail closed',async()=>{
  const forged=token(payload());
  for(const input of [
    token(payload({aud:'different-app'})),
    token(payload({iss:'https://attacker.cloudflareaccess.com'})),
    token(payload({exp:now()-1})),
    token(payload({nbf:now()+3600})),
    token(payload({iat:now()+3600})),
    forged.slice(0,-3)+'xyz',
    token(payload({email:42})),
    token(payload(),{alg:'none',kid:'fixture-key'}),
    'not.a.jwt'
  ]){
    assert.equal(await verifiedAccessEmail(input,iss,aud,keys),null);
  }
});

test('never trust the token-selected issuer or an unconfigured/unsafe trusted domain',async()=>{
  const jwt=token(payload());
  for(const issuer of [
    undefined,'','https://attacker.example',
    'http://apex-synthetic-team.cloudflareaccess.com',
    'https://apex-synthetic-team.cloudflareaccess.com.evil.test'
  ]){
    assert.equal(await verifiedAccessEmail(jwt,issuer,aud,keys),null);
  }
  assert.equal(await verifiedAccessEmail(jwt,iss,'an-unrelated-aud',keys),null);
});

test('accepts Access aud arrays but will not treat an unsigned JWT as an identity',async()=>{
  assert.equal(await verifiedAccessEmail(token(payload({aud:['elsewhere',aud]})),iss,aud,keys),
    'staff@example.test');
  const jwt=token(payload());
  const [h,p]=jwt.split('.');
  assert.equal(await verifiedAccessEmail(h+'.'+p+'.'+encode({fake:true}),iss,aud,keys),null);
});
