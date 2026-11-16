/** Run-owned temporary Vercel mutations; all execution goes through the scoped,
 * leased command context. Ownership survives indeterminate CLI/API responses. */
export const GATE_ORIGIN='https://livestocks-auth-gate.vercel.app';
export const ORIGINAL_DEPLOYMENT='https://livestocks-auth-gate-ilwjqb2sv-razs-projects-0212f70e.vercel.app';
export const ORIGINAL_DEPLOYMENT_ID='dpl_HgQpWQNGmADBvxr27G8WchtzZ5WC';
const DEPLOYMENT_HOST=/^livestocks-auth-gate-[a-z0-9]+-razs-projects-0212f70e\.vercel\.app$/;
function assert(value,message){if(!value)throw Error(message);}
export function createGateVercelLifecycle(context){
 const {command,projectId,teamId,runId}=context;
 const marker='livestocksGateRunId='+runId;
 const envPath='/v10/projects/'+projectId+'/env?teamId='+teamId;
 const deploymentsPath='/v6/deployments?projectId='+projectId+'&teamId='+teamId+'&limit=50';
 const aliasPath='/v4/aliases/'+new URL(GATE_ORIGIN).hostname+'?teamId='+teamId;
 const attemptedKeys=new Set(),unconfirmedKeys=new Set();let preflight=false,deploymentAttempted=false,deploymentUnconfirmed=false;
 const api=async path=>JSON.parse(await command(['api',path,'--raw']));
 async function environment(){const data=await api(envPath+'&decrypt=false');assert(Array.isArray(data.envs),'Environment metadata unavailable');return data.envs;}
 async function deployments(){const data=await api(deploymentsPath);assert(Array.isArray(data.deployments)&&data.deployments.length<50,'Deployment metadata unavailable or truncated');return data.deployments.filter(d=>d.meta?.livestocksGateRunId===runId).map(item=>{const id=item.uid??item.id;assert(typeof id==='string'&&/^dpl_[A-Za-z0-9]+$/.test(id),'Unexpected deployment identifier');return {...item,id};});}
 return {
  runId,
  async assertCleanPrestate(){
   assert((await environment()).filter(e=>e.target?.includes('production')).length===0,'Isolated environment is not empty; no overwrite allowed');
   const alias=await api(aliasPath);assert(alias.deploymentId===ORIGINAL_DEPLOYMENT_ID&&alias.projectId===projectId,'Isolated alias is not at the credential-free baseline');
   assert((await deployments()).length===0,'Run-owned deployment collision');preflight=true;
  },
  async addEnvironment(key,value){
   assert(preflight,'Cloud preflight required');attemptedKeys.add(key);
   try{await command(['api',envPath,'--method','POST','--input','-','--raw'],JSON.stringify({key,value,type:'sensitive',target:['production'],comment:marker}));}
   catch(error){if(error?.outcome!=='not_started')unconfirmedKeys.add(key);throw error;}
   const matches=(await environment()).filter(e=>e.key===key&&e.target?.includes('production'));
   assert(matches.length===1&&matches[0].comment===marker,'Environment ownership readback failed');
  },
  async deploy(){
   assert(preflight,'Cloud preflight required');deploymentAttempted=true;
   try{await command(['deploy','--prod','--force','--yes']);}
   catch(error){deploymentUnconfirmed=error?.outcome!=='not_started';throw error;}
   const owned=await deployments();assert(owned.length===1&&DEPLOYMENT_HOST.test(owned[0].url),'Run-owned deployment lookup failed');
   const url='https://'+owned[0].url;
   await command(['promote',url,'--yes']);
   const details=await api('/v13/deployments/'+owned[0].url+'?teamId='+teamId);const alias=await api(aliasPath);
   assert(details.readyState==='READY'&&alias.deploymentId===details.id&&alias.projectId===projectId,'Ready deployment/alias mismatch');
   return {url,id:details.id,readyState:details.readyState,aliasMatches:true};
  },
  async cleanup(){
   const result={ok:true,runId,deploymentsRemoved:0,environmentRemoved:0,errors:[]};
   const fail=(stage,error)=>{result.ok=false;result.errors.push({stage,code:typeof error?.code==='string'?error.code:'CLEANUP_FAILED'});};
   if(!preflight)return {...result,mutationsStarted:false};
   if(deploymentAttempted){
    try{
     const owned=await deployments();
     // A missing record after an indeterminate submission is not proof of absence:
     // remote creation may still finish. Leave an explicit reconciliation failure.
     assert(!deploymentUnconfirmed||owned.length>0,'Unconfirmed deployment submission has no observable result');
     const beforeRollback=await api(aliasPath);assert(beforeRollback.projectId===projectId&&(beforeRollback.deploymentId===ORIGINAL_DEPLOYMENT_ID||owned.some(item=>item.id===beforeRollback.deploymentId)),'Concurrent external alias change preserved');
     if(owned.length){await command(['rollback',ORIGINAL_DEPLOYMENT,'--yes']);for(const item of owned){assert(DEPLOYMENT_HOST.test(item.url),'Unexpected run deployment host');await command(['remove','https://'+item.url,'--yes']);result.deploymentsRemoved++;}}
     assert((await deployments()).length===0,'Run-owned immutable deployment remains');
     const alias=await api(aliasPath);assert(alias.deploymentId===ORIGINAL_DEPLOYMENT_ID&&alias.projectId===projectId,'Credential-free alias not restored');
     result.credentialFreeAliasRestored=true;
    }catch(error){fail('deployment_reconciliation',error);}
   }
   try{
    const candidates=await environment();
    for(const key of attemptedKeys){
     try{
     const matches=candidates.filter(e=>e.key===key&&e.target?.includes('production'));
     assert(!unconfirmedKeys.has(key)||matches.length>0,'Unconfirmed environment submission has no observable result');
     for(const record of matches){
      assert(record.comment===marker&&typeof record.id==='string','Unowned environment value preserved');
      // Verify ownership immediately before deleting the exact observed ID.
      const current=(await environment()).find(e=>e.id===record.id);
      if(!current)continue;
      assert(current.comment===marker&&current.key===key,'Environment ownership changed');
      try{await command(['api','/v9/projects/'+projectId+'/env/'+encodeURIComponent(record.id)+'?teamId='+teamId,'--method','DELETE','--dangerously-skip-permissions','--raw']);}catch(error){
       if((await environment()).some(e=>e.id===record.id))throw error;
      }
      result.environmentRemoved++;
     }
     }catch(error){fail('environment_key_reconciliation',error);}
    }
    const remaining=await environment();assert(!remaining.some(e=>e.comment===marker),'Run-owned environment remains');
    assert(!remaining.some(e=>attemptedKeys.has(e.key)&&e.target?.includes('production')),'Unexpected concurrent environment value preserved');
   }catch(error){fail('environment_reconciliation',error);}
   return result;
  },
 };
}
