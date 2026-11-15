import {setTimeout as delay} from 'node:timers/promises';
const TEST='qdcvlhghabchxstoedzq',CLEANER='fkhwimpzfhofxnbckfuf';
/** Complete fixed-project restoration. A transient pause failure must not skip
 * restoration, and cleaner restore must wait for a confirmed free project slot. */
export async function restoreHostedProjects({management,deadlineMs,testTouched,cleanerTouched,onProgress=async()=>{},now=Date.now,sleep=ms=>delay(ms),pollMs=4000}){
 const result={testPaused:!testTouched,cleanerHealthy:!cleanerTouched,errors:[]};
 const fail=stage=>{if(!result.errors.includes(stage))result.errors.push(stage);};
 if(!Number.isFinite(deadlineMs)||deadlineMs<=now())return {...result,ok:false,deadlineReached:true};
 const preferredPauseDeadline=deadlineMs-(cleanerTouched?7*60000:0);
 let lastPause=-Infinity;
 while(testTouched&&now()<deadlineMs){
  try{
   const current=await management(TEST);
   if(current.status==='INACTIVE'){result.testPaused=true;await onProgress('test_paused');break;}
   if(cleanerTouched&&now()>=preferredPauseDeadline&&!result.cleanerReserveReached){result.cleanerReserveReached=true;await onProgress('cleaner_restore_reserve_reached');}
   if(current.status==='ACTIVE_HEALTHY'&&now()-lastPause>=30000){lastPause=now();await management(TEST,'/pause','POST',{});}
  }catch{fail('test_pause_retry');}
  await sleep(Math.min(pollMs,Math.max(0,deadlineMs-now())));
 }
 if(!result.testPaused)return {...result,ok:false,deadlineReached:now()>=deadlineMs};
 let lastRestore=-Infinity;
 while(cleanerTouched&&now()<deadlineMs){
  try{
   const current=await management(CLEANER);
   if(current.status==='ACTIVE_HEALTHY'){
    const health=await management(CLEANER,'/database/query','POST',{query:'select 1 as healthy',read_only:true});
    if(health?.[0]?.healthy===1){result.cleanerHealthy=true;result.cleanerHealthyAt=new Date(now()).toISOString();await onProgress('cleaner_restored_and_select1_verified');break;}
    fail('cleaner_health_retry');
   }else if(current.status==='INACTIVE'&&now()-lastRestore>=30000){lastRestore=now();await management(CLEANER,'/restore','POST',{});}
  }catch{fail('cleaner_restore_retry');}
  await sleep(Math.min(pollMs,Math.max(0,deadlineMs-now())));
 }
 return {...result,ok:result.testPaused&&result.cleanerHealthy,deadlineReached:now()>=deadlineMs};
}
