// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createGateVercelLifecycle,ORIGINAL_DEPLOYMENT_ID} from '../scripts/lib/better-auth-gate-vercel.mjs';
const projectId='prj_cEKIsmvexYVOaiUTgp1hbOWGE6Zz',teamId='team_Vwue1DdSHaQvCACjh6T8CWVq',runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const host='livestocks-auth-gate-test123-razs-projects-0212f70e.vercel.app';
type Env={id:string;key:string;target:string[];comment:string};
type Deployment={id?:string;uid?:string;url:string;meta:{livestocksGateRunId:string}};
function setup(){
 const state={envs:[] as Env[],deployments:[] as Deployment[],alias:ORIGINAL_DEPLOYMENT_ID,failCreate:false,failDeploy:false,failDelete:false};
 const command=vi.fn(async(args:string[],input?:string)=>{
  if(args[0]==='api'){
   const url=new URL('https://api.vercel.com'+args[1]);
   if(url.pathname.endsWith('/env')){
    if(args.includes('POST')){const body=JSON.parse(input!);state.envs.push({id:'env_'+body.key,key:body.key,target:body.target,comment:body.comment});if(state.failCreate)throw Object.assign(Error('unconfirmed'),{outcome:'unconfirmed'});return '{}';}
    return JSON.stringify({envs:state.envs});
   }
   if(url.pathname.includes('/env/')){if(state.failDelete)throw Error('unconfirmed');state.envs=state.envs.filter(e=>e.id!==decodeURIComponent(url.pathname.split('/').pop()!));return '{}';}
   if(url.pathname==='/v6/deployments')return JSON.stringify({deployments:state.deployments});
   if(url.pathname.startsWith('/v4/aliases/'))return JSON.stringify({deploymentId:state.alias,projectId});
   if(url.pathname.startsWith('/v13/deployments/'))return JSON.stringify({id:'dpl_owned1',readyState:'READY'});
  }
  if(args[0]==='deploy'){state.deployments.push({uid:'dpl_owned1',url:host,meta:{livestocksGateRunId:runId}});if(state.failDeploy)throw Object.assign(Error('unconfirmed'),{outcome:'unconfirmed'});return 'no useful stdout';}
  if(args[0]==='promote'){state.alias='dpl_owned1';return '';}
  if(args[0]==='rollback'){state.alias=ORIGINAL_DEPLOYMENT_ID;return '';}
  if(args[0]==='remove'){state.deployments=state.deployments.filter(d=>'https://'+d.url!==args[1]);return '';}
  throw Error('Unexpected mock operation');
 });
 return {state,command,cloud:createGateVercelLifecycle({command,projectId,teamId,runId})};
}
describe('run-owned cloud mutation reconciliation',()=>{
 it('refuses pre-existing environment instead of overwriting',async()=>{
  const x=setup();x.state.envs.push({id:'other',key:'APP_BASE_URL',target:['production'],comment:'someone else'});
  await expect(x.cloud.assertCleanPrestate()).rejects.toThrow('not empty');expect(x.command.mock.calls.every(([args])=>!args.includes('POST'))).toBe(true);
 });
 it('deletes its tagged env after a remotely accepted create times out',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();x.state.failCreate=true;await expect(x.cloud.addEnvironment('BETTER_AUTH_SECRET','synthetic')).rejects.toThrow();
  expect(await x.cloud.cleanup()).toMatchObject({ok:true,environmentRemoved:1});expect(x.state.envs).toHaveLength(0);
 });
 it('finds and deletes a tagged deployment when deploy stdout is unavailable',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();x.state.failDeploy=true;await expect(x.cloud.deploy()).rejects.toThrow();
  expect(await x.cloud.cleanup()).toMatchObject({ok:true,deploymentsRemoved:1,credentialFreeAliasRestored:true});expect(x.state.deployments).toHaveLength(0);
 });
 it('never deletes a concurrent foreign environment record',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();await x.cloud.addEnvironment('BETTER_AUTH_SECRET','synthetic');x.state.envs[0].comment='foreign owner';
  expect(await x.cloud.cleanup()).toMatchObject({ok:false});expect(x.state.envs).toHaveLength(1);expect(x.command.mock.calls.some(([args])=>args.includes('DELETE'))).toBe(false);
 });
 it('surfaces cleanup failure even after successful deployment',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();await x.cloud.addEnvironment('BETTER_AUTH_SECRET','synthetic');await x.cloud.deploy();x.state.failDelete=true;
  expect(await x.cloud.cleanup()).toMatchObject({ok:false});expect(x.state.envs).toHaveLength(1);
 });
 it('deletes only this run and leaves another run deployment intact',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();await x.cloud.deploy();x.state.deployments.push({id:'dpl_foreign1',url:'livestocks-auth-gate-other-razs-projects-0212f70e.vercel.app',meta:{livestocksGateRunId:'another-run'}});
  expect(await x.cloud.cleanup()).toMatchObject({ok:true,deploymentsRemoved:1});expect(x.state.deployments.map(d=>d.id)).toEqual(['dpl_foreign1']);
 });
 it('does not claim cleanup when an unconfirmed deployment has not appeared yet',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();x.state.failDeploy=true;await expect(x.cloud.deploy()).rejects.toThrow();x.state.deployments=[];
  expect(await x.cloud.cleanup()).toMatchObject({ok:false});
 });
 it('does not claim cleanup when an unconfirmed environment write is not visible',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();x.state.failCreate=true;await expect(x.cloud.addEnvironment('BETTER_AUTH_SECRET','synthetic')).rejects.toThrow();x.state.envs=[];
  expect(await x.cloud.cleanup()).toMatchObject({ok:false});
 });

 it('cleans later owned keys even when an earlier uncertain submission is invisible',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();x.state.failCreate=true;await expect(x.cloud.addEnvironment('BETTER_AUTH_SECRET','synthetic')).rejects.toThrow();x.state.envs=[];x.state.failCreate=false;
  await x.cloud.addEnvironment('BETTER_AUTH_GATE_RUN_ID','synthetic');
  expect(await x.cloud.cleanup()).toMatchObject({ok:false,environmentRemoved:1});expect(x.state.envs).toHaveLength(0);
 });
 it('does not override an unrelated concurrent alias',async()=>{
  const x=setup();await x.cloud.assertCleanPrestate();await x.cloud.deploy();x.state.alias='dpl_foreign1';
  expect(await x.cloud.cleanup()).toMatchObject({ok:false});expect(x.state.alias).toBe('dpl_foreign1');expect(x.command.mock.calls.some(([args])=>args[0]==='rollback')).toBe(false);
 });

});
