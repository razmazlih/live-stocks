// @vitest-environment node
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const mock=vi.hoisted(()=>({files:new Map(),directories:new Set(),spawn:vi.fn(),children:[]}));
vi.mock('node:child_process',()=>({spawn:mock.spawn,default:{spawn:mock.spawn}}));
vi.mock('node:fs/promises',()=>{const api={
 realpath:vi.fn(async p=>p),
 lstat:vi.fn(async p=>{if(!mock.files.has(p)&&!mock.directories.has(p))throw Object.assign(Error('missing'),{code:'ENOENT'});return {uid:process.getuid(),mode:mock.directories.has(p)?0o700:0o600,isDirectory:()=>mock.directories.has(p),isFile:()=>mock.files.has(p),isSymbolicLink:()=>false};}),
 mkdir:vi.fn(async p=>{if(mock.directories.has(p))throw Object.assign(Error('exists'),{code:'EEXIST'});mock.directories.add(p);}),
 readFile:vi.fn(async p=>{if(!mock.files.has(p))throw Object.assign(Error('missing'),{code:'ENOENT'});return mock.files.get(p);}),
 writeFile:vi.fn(async(p,data,options)=>{if(options?.flag==='wx'&&mock.files.has(p))throw Object.assign(Error('exists'),{code:'EEXIST'});mock.files.set(p,data);}),
 unlink:vi.fn(async p=>{mock.files.delete(p);}),rmdir:vi.fn(async p=>{mock.directories.delete(p);}),
};return {...api,default:api};});
import {createGateCommandContext} from '../scripts/lib/better-auth-gate-command.mjs';
const SERVICE='/private/tmp/livestocks-hosted-issuer-fixture',REPORT='/private/tmp/livestocks-gate-report';
const LEASE='/private/tmp/livestocks-better-auth-gate-command-lease';
const PROJECT='prj_cEKIsmvexYVOaiUTgp1hbOWGE6Zz',TEAM='team_Vwue1DdSHaQvCACjh6T8CWVq';
let contexts=[];
function child(){const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=vi.fn();mock.children.push(c);return c;}
async function context(extra={}){const c=await createGateCommandContext({serviceDirectory:SERVICE,reportDirectory:REPORT,budgetMs:()=>10000,...extra});contexts.push(c);return c;}
async function flush(){for(let i=0;i<25;i++)await Promise.resolve();}
beforeEach(()=>{mock.files.clear();mock.directories.clear();mock.directories.add(SERVICE);mock.directories.add(REPORT);mock.children=[];mock.spawn.mockReset();mock.spawn.mockImplementation(()=>{const c=child();queueMicrotask(()=>{c.emit('spawn');c.stdout.write('safe-result');c.emit('close',0);});return c;});contexts=[];});
afterEach(async()=>{vi.useRealTimers();for(const c of contexts)await c.release().catch(()=>{});});
describe('fixed hosted-gate CLI boundary',()=>{
 it('creates the exact link and scopes every process in arguments and cwd',async()=>{const c=await context();expect(await c.command(['env','rm','APP_BASE_URL','production','--yes'])).toBe('safe-result');expect(JSON.parse(mock.files.get(SERVICE+'/.vercel/project.json'))).toEqual({projectId:PROJECT,orgId:TEAM});expect(mock.spawn.mock.calls[0][1]).toEqual(['env','rm','APP_BASE_URL','production','--yes','--cwd',SERVICE,'--scope','razs-projects-0212f70e']);expect(mock.spawn.mock.calls[0][2].cwd).toBe(SERVICE);});
 it('refuses a mismatched existing project without overwriting it or leaving its lease',async()=>{mock.directories.add(SERVICE+'/.vercel');const original=JSON.stringify({projectId:'production',orgId:TEAM});mock.files.set(SERVICE+'/.vercel/project.json',original);await expect(context()).rejects.toMatchObject({code:'PROJECT_LINK_MISMATCH'});expect(mock.files.get(SERVICE+'/.vercel/project.json')).toBe(original);expect(mock.directories.has(LEASE)).toBe(false);expect(mock.spawn).not.toHaveBeenCalled();});
 it('rechecks link ownership immediately before every invocation',async()=>{const c=await context();mock.files.set(SERVICE+'/.vercel/project.json',JSON.stringify({projectId:'wrong',orgId:TEAM}));await expect(c.command(['deploy','--prod'])).rejects.toMatchObject({code:'PROJECT_LINK_MISMATCH'});expect(mock.spawn).not.toHaveBeenCalled();});
 it('prevents a second context and never removes another nonce lease',async()=>{const c=await context();await expect(context()).rejects.toMatchObject({code:'RUN_LEASE_UNAVAILABLE'});mock.files.set(LEASE+'/owner.json',JSON.stringify({nonce:'other',runId:'other'}));await expect(c.release()).rejects.toMatchObject({code:'LEASE_OWNERSHIP_CHANGED'});expect(mock.directories.has(LEASE)).toBe(true);});
 it('rejects exhausted budgets before spawn',async()=>{const c=await context({budgetMs:()=>0});await expect(c.command(['deploy','--prod'])).rejects.toMatchObject({code:'BUDGET_INVALID',outcome:'not_started'});expect(mock.spawn).not.toHaveBeenCalled();});
 it('propagates a throwing budget without spawning',async()=>{const c=await context({budgetMs:()=>{throw Error('deadline');}});await expect(c.command(['deploy','--prod'])).rejects.toThrow('deadline');expect(mock.spawn).not.toHaveBeenCalled();});
 it('tags every deployment, permits deploy force, and rejects supplied metadata',async()=>{const c=await context();await c.command(['deploy','--prod','--force','--yes']);expect(mock.spawn.mock.calls[0][1]).toContain(`livestocksGateRunId=${c.runId}`);await expect(c.command(['deploy','--prod','--meta','unowned'])).rejects.toMatchObject({outcome:'not_started'});});
 it.each([
  ['env','add','BETTER_AUTH_SECRET','production','--force'],
  ['env','rm','UNRELATED','production','--yes'],
  ['env','rm','APP_BASE_URL','preview','--yes'],
  ['deploy','--prod','--cwd','/wrong'],
  ['deploy','--prod','--scope','wrong'],
  ['rollback','https://another.vercel.app','--yes'],
  ['remove','https://production.vercel.app','--yes'],
  ['api',`/v10/projects/${PROJECT}/env?teamId=${TEAM}&decrypt=true`,'--raw'],
  ['api','/v1/projects','--method','POST'],
 ])('rejects unsafe CLI arguments %j',async(...args)=>{const c=await context();await expect(c.command(args)).rejects.toMatchObject({outcome:'not_started'});expect(mock.spawn).not.toHaveBeenCalled();});
 it('accepts only fixed read API targets with no arbitrary credentials/body',async()=>{const c=await context();await c.command(['api',`/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=50`,'--raw']);await expect(c.command(['api',`/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=50`,'--raw','--token','secret'])).rejects.toMatchObject({outcome:'not_started'});});
 it('allows tagged non-upsert env creation through stdin and exact deletion',async()=>{const c=await context();const args=['api',`/v10/projects/${PROJECT}/env?teamId=${TEAM}`,'--method','POST','--input','-','--raw'];const body={key:'BETTER_AUTH_SECRET',value:'private-value',type:'sensitive',target:['production'],comment:`livestocksGateRunId=${c.runId}`};await c.command(args,JSON.stringify(body));expect(mock.spawn.mock.calls[0][1].join(' ')).not.toContain('private-value');await expect(c.command(args,JSON.stringify({...body,upsert:true}))).rejects.toMatchObject({code:'API_INPUT_INVALID'});await expect(c.command(args,JSON.stringify({...body,comment:'other'}))).rejects.toMatchObject({code:'API_INPUT_INVALID'});await c.command(['api',`/v9/projects/${PROJECT}/env/env_123?teamId=${TEAM}`,'--method','DELETE','--raw']);});

 it('permits noninteractive confirmation only for exact scoped environment DELETE',async()=>{const c=await context();await c.command(['api',`/v9/projects/${PROJECT}/env/env_123?teamId=${TEAM}`,'--method','DELETE','--dangerously-skip-permissions','--raw']);expect(mock.spawn.mock.calls[0][1]).toContain('--dangerously-skip-permissions');
  for(const args of [
   ['api',`/v10/projects/${PROJECT}/env?teamId=${TEAM}&decrypt=false`,'--dangerously-skip-permissions','--raw'],
   ['api',`/v10/projects/${PROJECT}/env?teamId=${TEAM}`,'--method','POST','--input','-','--dangerously-skip-permissions'],
   ['api',`/v9/projects/production/env/env_123?teamId=${TEAM}`,'--method','DELETE','--dangerously-skip-permissions'],
   ['deploy','--prod','--dangerously-skip-permissions'],
   ['env','rm','APP_BASE_URL','production','--yes','--dangerously-skip-permissions'],
  ])await expect(c.command(args)).rejects.toMatchObject({outcome:'not_started'});
  expect(mock.spawn).toHaveBeenCalledTimes(1);
 });
 it('reports failed started mutations as unconfirmed with private diagnostics only',async()=>{mock.spawn.mockImplementation(()=>{const c=child();queueMicrotask(()=>{c.emit('spawn');c.stderr.write('sensitive-diagnostic');c.stdout.write('private-structured-error');c.emit('close',1);});return c;});const c=await context();const error=await c.command(['env','rm','APP_BASE_URL','production','--yes']).catch(e=>e);expect(error).toMatchObject({code:'CLI_FAILED',outcome:'unconfirmed',operation:'env'});expect(error.message).not.toContain('sensitive');expect(error.message).not.toContain('private-structured-error');expect(mock.files.get(REPORT+`/command-${error.commandId}.stdout`)).toBe('private-structured-error');expect(mock.files.get(REPORT+`/command-${error.commandId}.stderr`)).toBe('sensitive-diagnostic');expect(mock.files.get(REPORT+`/command-${error.commandId}.json`)).not.toContain('sensitive');});
 it('marks a failure to spawn as not started',async()=>{mock.spawn.mockImplementation(()=>{throw Error('raw-secret-error');});const c=await context();await expect(c.command(['deploy','--prod'])).rejects.toMatchObject({code:'SPAWN_FAILED',outcome:'not_started'});});
 it('hard-kills an unresponsive command and records uncertain writes',async()=>{vi.useFakeTimers();mock.spawn.mockImplementation(()=>{const c=child();queueMicrotask(()=>c.emit('spawn'));return c;});const c=await context({budgetMs:()=>10});const result=c.command(['deploy','--prod']).catch(e=>e);await flush();await expect(c.release()).rejects.toMatchObject({code:'COMMAND_STILL_RUNNING'});await vi.advanceTimersByTimeAsync(2260);const error=await result;expect(error).toMatchObject({code:'TIMEOUT',outcome:'unconfirmed'});expect(mock.children[0].kill.mock.calls).toEqual([['SIGTERM'],['SIGKILL']]);});
 it('refuses operations after release',async()=>{const c=await context();await c.release();await expect(c.command(['deploy','--prod'])).rejects.toMatchObject({code:'CONTEXT_RELEASED'});});
});
