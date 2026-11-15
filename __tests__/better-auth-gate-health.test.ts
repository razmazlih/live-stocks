// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {gateHealth} from '../scripts/lib/better-auth-gate-health.mjs';
const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret='c'.repeat(64);
const issuer='https://synthetic.example/api/auth';
function setup(overrides: Record<string, unknown> = {}) {
 const end=vi.fn().mockResolvedValue(undefined);
 const query=vi.fn().mockResolvedValue({rows:[{role:'livestocks_auth_backend',auth_tables:13}]});
 const createPool=vi.fn(()=>({query,end,on:vi.fn()}));
 const configuration=vi.fn(()=>({issuer}));
 const handler=vi.fn().mockResolvedValue(Response.json({issuer,jwks_uri:issuer+'/jwks'}));
 const environment={NODE_ENV:'test' as const,BETTER_AUTH_GATE_RUN_ID:runId,BETTER_AUTH_GATE_PROBE_SECRET:secret};
 return {query,end,handler,configuration,createPool,health:gateHealth({runId,configuration,createPool,getAuth:()=>({handler}),environment,...overrides})};
}
const request=(path='/health/ready',key=secret)=>new Request('https://synthetic.example'+path,{headers:{'x-livestocks-gate-probe':key}});
describe('synthetic-only guarded deployment diagnostics',()=>{
 it('public health identifies the frozen source without touching configuration or storage',async()=>{
  const x=setup();const r=await x.health(request('/health',''));
  expect(await r!.json()).toEqual({service:'livestocks-synthetic-auth-gate',productionData:false,runId});
  expect(x.createPool).not.toHaveBeenCalled();expect(x.configuration).not.toHaveBeenCalled();
 });
 it.each(['','d'.repeat(64),'é'.repeat(64)])('rejects invalid probe secrets before any storage operation',async key=>{
  const x=setup();expect((await x.health(request('/health/ready',key)))!.status).toBe(404);expect(x.createPool).not.toHaveBeenCalled();
 });
 it('fails closed on a stale deployment environment run ID',async()=>{
  const x=setup({environment:{BETTER_AUTH_GATE_RUN_ID:'stale',BETTER_AUTH_GATE_PROBE_SECRET:secret}});
  expect(await (await x.health(request()))!.json()).toMatchObject({category:'RUN_ID_MISMATCH',environmentRunIdMatches:false});expect(x.createPool).not.toHaveBeenCalled();
 });
 it('classifies missing configuration without serializing exception text',async()=>{
  const x=setup({configuration:()=>{throw Error('password=never-print-this');}});
  const r=(await x.health(request()))!;expect(r.status).toBe(503);const text=await r.text();expect(text).toContain('CONFIGURATION_INVALID');expect(text).not.toContain('never-print');expect(x.createPool).not.toHaveBeenCalled();
 });
 it('runs only catalog/role checks and closes its limited pool',async()=>{
  const x=setup();expect((await x.health(request()))!.status).toBe(200);expect(x.end).toHaveBeenCalledOnce();
  expect(x.query.mock.calls[0][0]).toContain('pg_catalog.pg_tables');expect(x.query.mock.calls[0][0]).not.toContain('public.positions');
 });
 it('returns allowlisted SQLSTATE while suppressing credentials and raw errors',async()=>{
  const x=setup();x.query.mockRejectedValue(Object.assign(Error('postgres://secret:private@host'),{code:'28P01'}));
  const text=await (await x.health(request()))!.text();expect(text).toContain('28P01');expect(text).not.toContain('postgres://');expect(text).not.toContain('private@');expect(x.end).toHaveBeenCalledOnce();
 });
 it('rejects an unexpected backend role',async()=>{
  const x=setup();x.query.mockResolvedValue({rows:[{role:'postgres',auth_tables:13}]});expect(await (await x.health(request()))!.json()).toMatchObject({category:'STORAGE_CONTRACT_MISMATCH',roleMatches:false});
 });
 it('never accepts the wrong discovery issuer as readiness',async()=>{
  const x=setup();x.handler.mockResolvedValue(Response.json({issuer:'https://other.invalid',jwks_uri:issuer+'/jwks'}));
  const r=(await x.health(request('/health/provider')))!;expect(r.status).toBe(503);expect(await r.json()).toMatchObject({category:'DISCOVERY_INVALID',issuerMatches:false});
 });
 it('checks the actual provider handler after successful storage readiness',async()=>{
  const x=setup();expect((await x.health(request('/health/provider')))!.status).toBe(200);expect(x.handler).toHaveBeenCalledOnce();
 });
});
