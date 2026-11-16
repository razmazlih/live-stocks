/** Diagnostics for the isolated SYNTHETIC issuer only. Never imported by the app.
 * Public health identifies the frozen source. Storage/provider probes require a
 * separate random operator secret and return classifications, never error text.
 */
import {randomUUID,timingSafeEqual} from 'node:crypto';
const REQUIRED=['APP_BASE_URL','BETTER_AUTH_SECRET','BETTER_AUTH_DATABASE_URL','BETTER_AUTH_WEBSITE_CLIENT_ID','BETTER_AUTH_MCP_CLIENT_ID'];
const NETWORK_CODES=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID']);
function category(error){const code=error?.code;return typeof code==='string'&&(/^[0-9A-Z]{5}$/.test(code)||NETWORK_CODES.has(code))?code:'UNCLASSIFIED_FAILURE';}
function allowed(request,env){const expected=env.BETTER_AUTH_GATE_PROBE_SECRET;const supplied=request.headers.get('x-livestocks-gate-probe');return typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&typeof supplied==='string'&&/^[a-f0-9]{64}$/.test(supplied)&&timingSafeEqual(Buffer.from(expected),Buffer.from(supplied));}
export function gateHealth({runId,configuration,createPool,getAuth,environment=process.env}){
 if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('Invalid synthetic service source ID');
 return async request=>{
  const path=new URL(request.url).pathname;
  if(!['/health','/health/ready','/health/provider'].includes(path))return null;
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
  const base={service:'livestocks-synthetic-auth-gate',productionData:false,runId};
  if(path==='/health')return Response.json(base,{headers});
  if(request.method!=='GET'||!allowed(request,environment))return new Response('Not found',{status:404,headers});
  const requestId=randomUUID();const result={...base,requestId,environmentRunIdMatches:environment.BETTER_AUTH_GATE_RUN_ID===runId};
  const answer=(extra,status=503)=>Response.json({...result,...extra},{status,headers});
  if(!result.environmentRunIdMatches)return answer({stage:'environment',category:'RUN_ID_MISMATCH'});
  let config;
  try{config=configuration();}catch{return answer({stage:'configuration',category:'CONFIGURATION_INVALID',present:Object.fromEntries(REQUIRED.map(key=>[key,Boolean(environment[key])]))});}
  let pool;
  try{
   pool=createPool(config);pool.on?.('error',()=>{});
   const row=(await pool.query("select current_user as role,(select count(*)::integer from pg_catalog.pg_tables where schemaname='livestocks_auth') as auth_tables")).rows[0];
   if(row?.role!=='livestocks_auth_backend'||row?.auth_tables!==13)return answer({stage:'storage',category:'STORAGE_CONTRACT_MISMATCH',roleMatches:row?.role==='livestocks_auth_backend',authTableCount:Number.isInteger(row?.auth_tables)?row.auth_tables:null});
  }catch(error){return answer({stage:'storage',category:category(error)});}finally{await pool?.end().catch(()=>{});}
  if(path==='/health/ready')return answer({stage:'storage',category:'READY'},200);
  try{
   const auth=getAuth();if(!auth)return answer({stage:'provider',category:'AUTH_CONTEXT_UNAVAILABLE'});
   const response=await auth.handler(new Request(config.issuer+'/.well-known/openid-configuration'));
   const data=await response.json().catch(()=>null);
   const matches=data?.issuer===config.issuer&&data?.jwks_uri===config.issuer+'/jwks';
   if(!response.ok||!matches)return answer({stage:'provider',category:'DISCOVERY_INVALID',httpStatus:response.status,issuerMatches:data?.issuer===config.issuer,jwksMatches:data?.jwks_uri===config.issuer+'/jwks'});
   return answer({stage:'provider',category:'READY'},200);
  }catch(error){return answer({stage:'provider',category:category(error)});}
 };
}
