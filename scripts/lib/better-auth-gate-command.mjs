/** Fixed-target CLI boundary for the synthetic hosted gate. Never prints output. */
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {lstat,realpath,readFile,writeFile,mkdir,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const PROJECT='prj_cEKIsmvexYVOaiUTgp1hbOWGE6Zz';
const TEAM='team_Vwue1DdSHaQvCACjh6T8CWVq';
const SCOPE='razs-projects-0212f70e';
const LEASE='/private/tmp/livestocks-better-auth-gate-command-lease';
const ORIGINAL='https://livestocks-auth-gate-ilwjqb2sv-razs-projects-0212f70e.vercel.app';
const DEPLOYMENT=/^https:\/\/livestocks-auth-gate-[a-z0-9]+-razs-projects-0212f70e\.vercel\.app$/;
const ENV_KEYS=new Set(['APP_BASE_URL','PASSWORD_AUTH_ENABLED',...['SECRET','WEBSITE_CLIENT_ID','MCP_CLIENT_ID','MCP_CLIENT_SECRET','DATABASE_URL','DATABASE_CA','GATE_RUN_ID','GATE_PROBE_SECRET'].map(key=>'BETTER_AUTH_'+key)]);
const limit=1024*1024;
function failure(code,operation='validation',outcome='not_started',commandId){
 const error=new Error(`Synthetic gate command failed (${code})`);
 Object.assign(error,{code,operation,outcome,...(commandId?{commandId}:{})});return error;
}
function requireThat(value,code){if(!value)throw failure(code);}
async function privateDirectory(path){
 const canonical=await realpath(path);requireThat(resolve(path)===canonical&&canonical.startsWith('/private/tmp/'),'DIRECTORY_BOUNDARY');
 const info=await lstat(canonical);requireThat(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'DIRECTORY_PERMISSIONS');return canonical;
}
async function privateRead(path){
 const info=await lstat(path);requireThat(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'FILE_PERMISSIONS');
 return JSON.parse(await readFile(path,'utf8'));
}
function apiPathAllowed(path){
 const u=new URL(path,'https://api.vercel.com');
 if(!path.startsWith('/')||u.origin!=='https://api.vercel.com'||u.hash)return false;
 const pairs=[...u.searchParams];if(new Set(pairs.map(([key])=>key)).size!==pairs.length)return false;
 const exact=params=>pairs.length===Object.keys(params).length&&Object.entries(params).every(([key,value])=>u.searchParams.get(key)===value);
 if(u.pathname===`/v10/projects/${PROJECT}/env`)return exact({teamId:TEAM,decrypt:'false'});
 if(u.pathname==='/v6/deployments')return exact({projectId:PROJECT,teamId:TEAM,limit:'50'});
 if(/^\/v13\/deployments\/livestocks-auth-gate-[a-z0-9]+-razs-projects-0212f70e\.vercel\.app$/.test(u.pathname)||u.pathname==='/v4/aliases/livestocks-auth-gate.vercel.app')return exact({teamId:TEAM});
 return false;
}
function commandArguments(args,service,runId,input){
 requireThat(Array.isArray(args)&&args.length>0&&args.every(value=>typeof value==='string'&&!/[\r\n\0]/.test(value)),'ARGUMENTS_INVALID');
 const clean=[];const seen=new Set();
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(key==='--cwd'||key==='--scope'){
   requireThat(!seen.has(key)&&args[i+1]===(key==='--cwd'?service:SCOPE),'CLI_SCOPE_MISMATCH');seen.add(key);i++;
  }else clean.push(key);
 }
 const [operation,...rest]=clean;
 const only=allowed=>rest.every(value=>allowed.includes(value))&&new Set(rest).size===rest.length;
 if(operation==='env'){
  const [action,key,target,...flags]=rest;
  requireThat(['add','rm'].includes(action)&&ENV_KEYS.has(key)&&target==='production','ENV_TARGET_INVALID');
  requireThat(flags.every(flag=>(action==='add'?['--sensitive','--yes']:['--yes']).includes(flag))&&new Set(flags).size===flags.length,'ENV_FLAGS_INVALID');
  requireThat(action==='add'?typeof input==='string'&&input.length>0:input===undefined,'ENV_INPUT_INVALID');
 }else{
  if(operation!=='api')requireThat(input===undefined,'UNEXPECTED_INPUT');
  if(operation==='deploy'){
   requireThat(only(['--prod','--force','--yes'])&&rest.includes('--prod'),'DEPLOY_FLAGS_INVALID');
   clean.push('--meta',`livestocksGateRunId=${runId}`);
  }else if(['promote','remove','rollback'].includes(operation)){
   requireThat(rest.length===2&&rest[1]==='--yes'&&DEPLOYMENT.test(rest[0])&&(operation!=='rollback'||rest[0]===ORIGINAL),'DEPLOYMENT_TARGET_INVALID');
  }else if(operation==='api'){
   const path=rest[0],flags=rest.slice(1).filter(flag=>flag!=='--raw');
   requireThat(rest.filter(flag=>flag==='--raw').length<=1,'API_FLAGS_INVALID');
   if(flags.length===0){requireThat(input===undefined&&apiPathAllowed(path),'API_TARGET_INVALID');}
   else if(flags.join(' ')==='--method POST --input -'){
    requireThat(path===`/v10/projects/${PROJECT}/env?teamId=${TEAM}`&&typeof input==='string','API_TARGET_INVALID');
    let body;try{body=JSON.parse(input);}catch{throw failure('API_INPUT_INVALID');}
    requireThat(body&&Object.keys(body).sort().join(',')==='comment,key,target,type,value'&&ENV_KEYS.has(body.key)&&typeof body.value==='string'&&body.value.length>0&&body.type==='sensitive'&&Array.isArray(body.target)&&body.target.length===1&&body.target[0]==='production'&&body.comment===`livestocksGateRunId=${runId}`,'API_INPUT_INVALID');
   }else if(['--method DELETE','--method DELETE --dangerously-skip-permissions'].includes(flags.join(' '))){
    const u=new URL(path,'https://api.vercel.com');
    requireThat(input===undefined&&path.startsWith('/')&&u.origin==='https://api.vercel.com'&&!u.hash&&new RegExp(`^/v9/projects/${PROJECT}/env/[A-Za-z0-9_]{1,128}$`).test(u.pathname)&&u.search===`?teamId=${TEAM}`,'API_TARGET_INVALID');
   }else throw failure('API_FLAGS_INVALID');
  }else throw failure('OPERATION_INVALID');
 }
 return {args:[...clean,'--cwd',service,'--scope',SCOPE],operation};
}

export async function createGateCommandContext({serviceDirectory,reportDirectory,budgetMs}){
 requireThat(typeof budgetMs==='function','BUDGET_REQUIRED');
 const service=await privateDirectory(serviceDirectory),reports=await privateDirectory(reportDirectory);
 requireThat(/^\/private\/tmp\/livestocks-hosted-issuer-[A-Za-z0-9]+$/.test(service),'SERVICE_BOUNDARY');
 const runId=randomUUID(),nonce=randomUUID();let released=false,inflight=0;
 try{await mkdir(LEASE,{mode:0o700});}catch{throw failure('RUN_LEASE_UNAVAILABLE');}
 try{
  await writeFile(join(LEASE,'owner.json'),JSON.stringify({runId,nonce,pid:process.pid}),{mode:0o600,flag:'wx'});
  const vercel=join(service,'.vercel');
  try{await mkdir(vercel,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  await privateDirectory(vercel);
  const link=join(vercel,'project.json');
  try{await writeFile(link,JSON.stringify({projectId:PROJECT,orgId:TEAM}),{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  const checkLink=async()=>{
   requireThat(!released,'CONTEXT_RELEASED');await privateDirectory(service);await privateDirectory(reports);await privateDirectory(vercel);await privateDirectory(LEASE);
   const owner=await privateRead(join(LEASE,'owner.json'));requireThat(owner.nonce===nonce&&owner.runId===runId,'LEASE_OWNERSHIP_CHANGED');
   const linked=await privateRead(link);requireThat(linked.projectId===PROJECT&&linked.orgId===TEAM,'PROJECT_LINK_MISMATCH');
  };
  await checkLink();
  return {
   runId,serviceDirectory:service,projectId:PROJECT,teamId:TEAM,
   async command(rawArgs,input){
    requireThat(!released,'CONTEXT_RELEASED');inflight++;
    try{
    await checkLink();const {args,operation}=commandArguments(rawArgs,service,runId,input);
    const timeout=budgetMs(180000);requireThat(Number.isFinite(timeout)&&timeout>0&&timeout<=180000,'BUDGET_INVALID');
    const commandId=randomUUID();
    return await new Promise((resolveCommand,rejectCommand)=>{
     let child,started=false,settled=false,timedOut=false,stdout='',stderr='',termTimer,killTimer,finishTimer;
     const finish=async(code,exitCode)=>{
      if(settled)return;settled=true;clearTimeout(termTimer);clearTimeout(killTimer);clearTimeout(finishTimer);
      if(!code){resolveCommand(stdout);return;}
      const outcome=started?'unconfirmed':'not_started';
      try{
       await writeFile(join(reports,`command-${commandId}.json`),JSON.stringify({commandId,runId,operation,code,outcome,exitCode:typeof exitCode==='number'?exitCode:null}),{mode:0o600,flag:'wx'});
       await writeFile(join(reports,`command-${commandId}.stderr`),stderr,{mode:0o600,flag:'wx'});
       await writeFile(join(reports,`command-${commandId}.stdout`),stdout,{mode:0o600,flag:'wx'});
      }catch{/* Never expose diagnostic content or mask the original uncertain write. */}
      rejectCommand(failure(code,operation,outcome,commandId));
     };
     try{child=spawn('vercel',args,{cwd:service,env:{PATH:process.env.PATH,HOME:process.env.HOME,CI:'1'},stdio:['pipe','pipe','pipe']});}
     catch{void finish('SPAWN_FAILED');return;}
     child.once('spawn',()=>{started=true;});
     child.stdout.on('data',value=>{stdout=(stdout+value).slice(-limit);});
     child.stderr.on('data',value=>{stderr=(stderr+value).slice(-limit);});
     child.stdin.on('error',()=>{});
     const kill=signal=>{try{child.kill(signal);}catch{/* Still report the remote outcome as uncertain. */}};
     child.once('error',()=>{if(started)kill('SIGKILL');void finish('PROCESS_ERROR');});
     child.once('close',(code)=>{void finish(timedOut?'TIMEOUT':code===0?null:'CLI_FAILED',code);});
     termTimer=setTimeout(()=>{
      timedOut=true;kill('SIGTERM');
      killTimer=setTimeout(()=>{kill('SIGKILL');finishTimer=setTimeout(()=>{void finish('TIMEOUT');},250);},2000);
     },timeout);
     try{child.stdin.end(input);}catch{kill('SIGKILL');void finish('PROCESS_ERROR');}
    });}finally{inflight--;}
   },
   async release(){
    if(released)return;requireThat(inflight===0,'COMMAND_STILL_RUNNING');
    const owner=await privateRead(join(LEASE,'owner.json'));requireThat(owner.nonce===nonce&&owner.runId===runId,'LEASE_OWNERSHIP_CHANGED');
    await unlink(join(LEASE,'owner.json'));await rmdir(LEASE);released=true;
   }
  };
 }catch(error){
  try{const owner=await privateRead(join(LEASE,'owner.json'));if(owner.nonce===nonce){await unlink(join(LEASE,'owner.json'));await rmdir(LEASE);}}catch{/* Leave any uncertain lease closed. */}
  throw error?.code?.startsWith?.('E')?failure('CONTEXT_INITIALIZATION_FAILED'):error;
 }
}
