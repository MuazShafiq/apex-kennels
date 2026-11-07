import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('production Wrangler deploy preserves dashboard-managed variables',()=>{
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')) as {
    name:string;keep_vars?:boolean;vars?:Record<string,string>
  };
  assert.equal(config.name,'apex-kennels-api');
  assert.equal(config.keep_vars,true,
    'Deployments must not silently delete Cloudflare dashboard environment variables');
  assert.equal(config.vars?.APEX_STAFF_DRAFTS_ENABLED,'true',
    'Saved invoice drafts must remain enabled after deployment');
});

test('staging remains a separate Worker and has no production invoice flag',()=>{
  const config=JSON.parse(readFileSync('wrangler.staging.jsonc','utf8')) as {
    name:string;vars?:Record<string,string>
  };
  assert.notEqual(config.name,'apex-kennels-api');
  assert.notEqual(config.vars?.APEX_STAFF_DRAFTS_ENABLED,'true');
});
