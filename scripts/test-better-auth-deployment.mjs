#!/usr/bin/env node
/** Credential-free synthetic Vercel preflight. No Supabase access or pause. */
import {readFile,writeFile,realpath,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createGateCommandContext} from './lib/better-auth-gate-command.mjs';
import {createGateVercelLifecycle,GATE_ORIGIN} from './lib/better-auth-gate-vercel.mjs';
process.umask(0o077);
const directory=await mkdtemp('/private/tmp/livestocks-deployment-preflight-');
const report={status:'INCOMPLETE',supabaseAccess:false,startedAt:new Date().toISOString(),cleanup:{}};
const save=()=>writeFile(join(directory,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
function assert(value,message){if(!value)throw Error(message);}
assert(process.argv.length===4&&process.argv[2]==='--service-directory','Explicit prepared service required');
const service=await realpath(process.argv[3]);const manifest=JSON.parse(await readFile(join(service,'source-manifest.json'),'utf8'));
assert(/^[a-f0-9-]{36}$/.test(manifest.gateRunId),'Instrumented source required');report.gateRunId=manifest.gateRunId;report.sourceHashes=manifest.sourceHashes;
let cleaning=false,cancelled=false;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cancelled=true;});
const context=await createGateCommandContext({serviceDirectory:service,reportDirectory:directory,budgetMs:maximum=>{assert(!cancelled||cleaning,'Interrupted; cleaning isolated preflight');return Math.min(maximum,cleaning?45000:180000);}});
const cloud=createGateVercelLifecycle(context);report.cloudRunId=context.runId;
try{
 await cloud.assertCleanPrestate();
 const probe=randomBytes(32).toString('hex');
 for(const [key,value] of Object.entries({BETTER_AUTH_GATE_RUN_ID:manifest.gateRunId,BETTER_AUTH_GATE_PROBE_SECRET:probe}))await cloud.addEnvironment(key,value);
 report.deployment=await cloud.deploy();
 const health=await fetch(GATE_ORIGIN+'/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});const publicData=await health.json();assert(health.ok&&publicData.runId===manifest.gateRunId,'New public source not observed');report.publicSourceMatches=true;
 const denied=await fetch(GATE_ORIGIN+'/health/ready',{redirect:'error',signal:AbortSignal.timeout(15000)});assert(denied.status===404,'Unauthenticated readiness exposed');report.unguardedProbeDenied=true;
 const ready=await fetch(GATE_ORIGIN+'/health/ready',{headers:{'x-livestocks-gate-probe':probe},redirect:'error',signal:AbortSignal.timeout(15000)});const data=await ready.json();
 assert(ready.status===503&&data.runId===manifest.gateRunId&&data.environmentRunIdMatches===true&&data.category==='CONFIGURATION_INVALID'&&Object.values(data.present).every(value=>value===false),'Missing configuration was not classified correctly');report.readiness={status:ready.status,category:data.category,environmentRunIdMatches:true,allAuthConfigurationAbsent:true,requestId:data.requestId};
 const discovery=await fetch(GATE_ORIGIN+'/api/auth/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(15000)});const body=await discovery.json();assert(discovery.status===503&&body.code==='AUTH_UNAVAILABLE','Credential-free discovery unexpectedly available');report.discovery={status:503,code:'AUTH_UNAVAILABLE'};
 assert(!cancelled,'Interrupted; cleaning isolated preflight');report.status='PASS_CREDENTIAL_FREE_DEPLOYMENT_PREFLIGHT';
}catch(error){report.reason=error.code||error.message;}
finally{
 cleaning=true;
 try{report.cleanup.vercel=await cloud.cleanup();}catch{report.cleanup.vercel={ok:false};}
 try{await context.release();report.cleanup.leaseReleased=true;}catch{report.cleanup.leaseReleased=false;}
 if(report.cleanup.vercel?.ok!==true||!report.cleanup.leaseReleased){report.status='INCOMPLETE';report.cleanupFailed=true;}
 report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,reason:report.reason,cleanup:report.cleanup,report:join(directory,'report.json')}));
 if(report.status!=='PASS_CREDENTIAL_FREE_DEPLOYMENT_PREFLIGHT')process.exitCode=2;
}
