// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {restoreHostedProjects} from '../scripts/lib/better-auth-gate-restoration.mjs';
const TEST='qdcvlhghabchxstoedzq',CLEANER='fkhwimpzfhofxnbckfuf';
function fixture(){
 let clock=0;const state={test:'ACTIVE_HEALTHY',cleaner:'INACTIVE',pauseFailures:0,restoreFailures:0,healthFailures:0,pauseDelayMs:0};
 const management=vi.fn(async(ref:string,path='',_method='GET',body?:unknown)=>{
  if(![TEST,CLEANER].includes(ref))throw Error('Unexpected project');
  if(!path)return {status:ref===TEST?state.test:state.cleaner};
  if(ref===TEST&&path==='/pause'){if(state.pauseFailures-->0)throw Error('Transient failure');state.test='INACTIVE';clock+=state.pauseDelayMs;return {};}
  if(ref===CLEANER&&path==='/restore'){expect(state.test).toBe('INACTIVE');if(state.restoreFailures-->0)throw Error('Transient failure');state.cleaner='ACTIVE_HEALTHY';return {};}
  if(ref===CLEANER&&path==='/database/query'){expect(body).toEqual({query:'select 1 as healthy',read_only:true});if(state.healthFailures-->0)throw Error('Transient failure');return [{healthy:1}];}
  throw Error('Unexpected cleanup action');
 });
 const options={management,deadlineMs:15*60000,testTouched:true,cleanerTouched:true,now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}};
 return {state,management,options};
}
describe('bounded complete fixed-project restoration',()=>{
 it('retries a transient pause failure then restores cleaner and verifies SQL health',async()=>{
  const x=fixture();x.state.pauseFailures=1;
  expect(await restoreHostedProjects(x.options)).toMatchObject({ok:true,testPaused:true,cleanerHealthy:true,errors:['test_pause_retry']});
  expect(x.management.mock.calls.filter(([,path])=>path==='/pause')).toHaveLength(2);
 });
 it('retries restore and health failures without rerunning the gate',async()=>{
  const x=fixture();x.state.restoreFailures=1;x.state.healthFailures=1;
  expect(await restoreHostedProjects(x.options)).toMatchObject({ok:true,cleanerHealthy:true,errors:['cleaner_restore_retry']});
  expect(x.management.mock.calls.every(([ref,path])=>!path||ref===TEST&&path==='/pause'||ref===CLEANER&&['/restore','/database/query'].includes(path))).toBe(true);
 });
 it('never restores cleaner before the test slot is confirmed inactive',async()=>{
  const x=fixture();x.state.pauseFailures=100;
  expect(await restoreHostedProjects(x.options)).toMatchObject({ok:false,testPaused:false,cleanerHealthy:false,deadlineReached:true});
  expect(x.management.mock.calls.some(([ref])=>ref===CLEANER)).toBe(false);
 });
 it('does not mutate after deadline or pause a previously untouched test project',async()=>{
  const x=fixture();expect(await restoreHostedProjects({...x.options,deadlineMs:0})).toMatchObject({ok:false});expect(x.management).not.toHaveBeenCalled();
  x.state.test='INACTIVE';expect(await restoreHostedProjects({...x.options,testTouched:false})).toMatchObject({ok:true});
  expect(x.management.mock.calls.some(([ref])=>ref===TEST)).toBe(false);
 });
 it('still reconciles an already paused TEST with less than seven minutes remaining',async()=>{
  const x=fixture();x.state.test='INACTIVE';
  expect(await restoreHostedProjects({...x.options,deadlineMs:6*60000})).toMatchObject({ok:true,testPaused:true,cleanerHealthy:true});
  expect(x.management.mock.calls.some(([ref,path])=>ref===TEST&&path==='/pause')).toBe(false);
 });
 it('observes a delayed completed pause after the preferred reserve boundary',async()=>{
  const x=fixture();x.state.pauseDelayMs=9*60000;
  expect(await restoreHostedProjects(x.options)).toMatchObject({ok:true,testPaused:true,cleanerHealthy:true});
 });

});
