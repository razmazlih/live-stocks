#!/usr/bin/env node
/** Build a synthetic-only isolated issuer service from the actual auth source.
 * No environment files, credentials, financial routes, provider mutation or deployment.
 */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import {build} from 'esbuild';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.umask(0o077);
if (process.argv.length !== 2) throw new Error('This preparer accepts no arguments or secret input');
const directory = await mkdtemp('/private/tmp/livestocks-hosted-issuer-');
await mkdir(join(directory,'api')); await mkdir(join(directory,'lib'));
const sourceHashes = {};const gateRunId=randomUUID();
const output = await build({stdin:{contents:'export {handleBetterAuthRequest} from "./lib/auth/better-auth-handler.ts";export {betterAuthConfiguration,createAuthPool,getBetterAuth} from "./lib/auth/better-auth.ts";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,metafile:true,
  plugins:[{name:'isolated-node-server-only',setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
for(const filename of Object.keys(output.metafile.inputs).filter(name=>!name.startsWith('empty:')&&name!=='<stdin>')) {
  sourceHashes[filename]=createHash('sha256').update(await readFile(resolve(root,filename))).digest('hex');
}
await writeFile(join(directory,'lib/provider.mjs'),output.outputFiles[0].text);
const diagnosticSource=await readFile(join(root,'scripts/lib/better-auth-gate-health.mjs'));
sourceHashes['scripts/lib/better-auth-gate-health.mjs']=createHash('sha256').update(diagnosticSource).digest('hex');
await writeFile(join(directory,'lib/gate-health.mjs'),diagnosticSource);
await writeFile(join(directory,'api/index.mjs'),`import {handleBetterAuthRequest,betterAuthConfiguration,createAuthPool,getBetterAuth} from '../lib/provider.mjs';
import {gateHealth} from '../lib/gate-health.mjs';
const health=gateHealth({runId:'${gateRunId}',configuration:betterAuthConfiguration,createPool:createAuthPool,getAuth:getBetterAuth});
export default { async fetch(request) {
 const path=new URL(request.url).pathname;
 const diagnostic=await health(request);if(diagnostic)return diagnostic;
 if(!path.startsWith('/api/auth/'))return new Response('Not found',{status:404});
 return handleBetterAuthRequest(request);
}};
`);
await writeFile(join(directory,'vercel.json'),JSON.stringify({rewrites:[{source:'/(.*)',destination:'/api/index'}],functions:{'api/index.mjs':{maxDuration:30}},headers:[{source:'/(.*)',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]},null,2));
await writeFile(join(directory,'package.json'),JSON.stringify({name:'livestocks-synthetic-auth-gate',private:true,type:'module',engines:{node:'22.x'},dependencies:{'better-auth':'1.7.23','@better-auth/oauth-provider':'1.7.23',pg:'8.23.1',nodemailer:'10.5.0',jose:'6.2.17'}},null,2));
await writeFile(join(directory,'.npmrc'),'legacy-peer-deps=true\n');
await writeFile(join(directory,'source-manifest.json'),JSON.stringify({purpose:'isolated synthetic hosted compatibility gate',gateRunId,sourceHashes,productionData:false},null,2));
console.log(JSON.stringify({status:'PREPARED_NO_DEPLOYMENT',directory,sourceFiles:Object.keys(sourceHashes)}));
