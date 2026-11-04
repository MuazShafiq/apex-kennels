#!/usr/bin/env node
/**
 * Controlled source -> existing Form-bound Apps Script sync.
 *
 * clasp replaces the *entire* remote project. Pull/back up every remote file
 * first and preserve everything except the one owned ApexIntake.gs file.
 *
 * No triggers, Script Properties, historical responses, bookings or invoice
 * emails are changed by this tool. A separate, deliberate cutover is required.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync} from 'node:fs';
import {join, resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ownedSource=join(root,'integrations','google-form','Code.gs');
const targetFile=join(root,'.apex-form-target.json');
const backups=join(root,'.apex-form-backups');
const idArg=process.argv.slice(2).find(x=>x.startsWith('--script-id='));
const checkOnly=process.argv.includes('--check-only');
const inputId=idArg ? idArg.slice('--script-id='.length) : undefined;
const scriptIdPattern=/^[A-Za-z0-9_-]{20,128}$/;

function cli(command,args,cwd=root) {
  const executable=process.platform==='win32'?'npx.cmd':'npx';
  const result=spawnSync(executable,['--yes','@google/clasp@3.4.1',command,...args],{
    cwd,stdio:'inherit',shell:process.platform==='win32'
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('clasp '+command+' failed (exit '+result.status+'). Verify Apps Script API access and your Google login.');
}
function checkTests() {
  const executable=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(executable,['test'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Local tests failed; refusing to push Apps Script.');
}
function walk(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(entry.name==='.clasp.json')return [];
    const p=join(dir,entry.name);
    return entry.isDirectory()?walk(p):[p];
  });
}
function main() {
  const saved=existsSync(targetFile)?JSON.parse(readFileSync(targetFile,'utf8')):{};
  const scriptId=inputId??saved.scriptId;
  if(!scriptId||!scriptIdPattern.test(scriptId)) {
    throw new Error('First run: npm.cmd run form:sync -- --script-id=YOUR_EXISTING_APPS_SCRIPT_ID');
  }
  if(saved.scriptId && inputId && saved.scriptId!==inputId) {
    throw new Error('Refusing to switch Apps Script projects. Inspect the ignored .apex-form-target.json first.');
  }
  if(!existsSync(ownedSource))throw new Error('Cannot find local canonical Code.gs.');
  checkTests();

  mkdirSync(backups,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
  const snapshot=join(backups,stamp);
  const remoteBackup=join(snapshot,'remote');
  const upload=join(snapshot,'upload');
  mkdirSync(remoteBackup,{recursive:true});
  writeFileSync(join(remoteBackup,'.clasp.json'),JSON.stringify({scriptId},null,2)+'\n');
  console.log('\nBacking up the remote Apps Script project locally. No files are overwritten on Google yet.');
  cli('pull',[],remoteBackup);

  const pulled=walk(remoteBackup);
  if(!pulled.some(p=>p.endsWith('appsscript.json'))) {
    throw new Error('Remote Apps Script manifest missing. Refusing to push.');
  }
  // The primary Form-bound script is expected at project root; refuse nested
  // duplicates rather than accidentally creating a second global function.
  const nameMatches=pulled.filter(p=>/^(?:ApexIntake\.gs|ApexIntake\.js)$/i.test(relative(remoteBackup,p).replace(/\\/g,'/')));
  if(nameMatches.length>1)throw new Error('More than one ApexIntake file exists in the remote project.');
  const target=nameMatches[0]??join(remoteBackup,'ApexIntake.gs');
  const prior=existsSync(target)?readFileSync(target,'utf8'):null;
  const desired=readFileSync(ownedSource,'utf8');

  // Other remote files stay verbatim. They must not redefine our functions.
  const ownedFunctionNames=[...desired.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
  for(const remote of pulled){
    if(remote===target || !/\.(?:gs|js)$/i.test(remote))continue;
    const remoteText=readFileSync(remote,'utf8');
    const collisions=ownedFunctionNames.filter(fn=>new RegExp('\\bfunction\\s+'+fn+'\\s*\\(').test(remoteText));
    if(collisions.length){
      throw new Error('Remote '+relative(remoteBackup,remote)+' duplicates owned functions ('+collisions.join(', ')+'). No changes pushed. Review the backup.');
    }
  }

  console.log('Unmodified remote backup saved to '+remoteBackup);
  if(prior===desired) {
    console.log('ApexIntake.gs already matches GitHub source. Nothing to sync.');
  } else {
    console.log('Will replace ONLY ApexIntake.gs; all other script files and the remote manifest are preserved.');
    if(checkOnly){
      console.log('CHECK ONLY: No Google project changes made.');
      return;
    }
    // Preserve the original pull as an immutable local rollback snapshot.
    cpSync(remoteBackup,upload,{recursive:true});
    writeFileSync(join(upload,relative(remoteBackup,target)),desired,'utf8');
    cli('push',['--force'],upload);
    console.log('ApexIntake.gs synced. This did NOT enable the intake trigger or send a booking.');
  }
  if(!saved.scriptId) {
    writeFileSync(targetFile,JSON.stringify({scriptId},null,2)+'\n');
    console.log('Saved local project ID to ignored .apex-form-target.json.');
  }
  console.log('In Apps Script run apexPreflight once to check the full, disabled mapping.');
}
try {main()} catch(e){console.error('\nForm sync stopped safely: '+e.message);process.exitCode=1;}
