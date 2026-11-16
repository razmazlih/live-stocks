#!/usr/bin/env node
/** PREPARE ONLY. Writes protected reviewed SQL; never connects or executes it. */
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeBackupDirectory} from './prepare-account-migration.mjs';
import {PROJECT,AUTH_SOURCE_SHA256,authPrefix,preprovisionAuthSql,sha256} from './owner-store-adoption.mjs';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
async function main(){
 const args=process.argv.slice(2),options={};
 if(args.includes('--help')){console.log('Preparation only: node scripts/prepare-owner-store.mjs --project osvwctooasdxsztatirz --env-file /absolute/private/better-auth-env.json --output-directory /absolute/private/review-directory\nCreates protected 00-preprovision-owner-store.sql; does not connect, apply SQL, or change financial data. Use the separately checked exact-project TLS connection for manual execution.');return;}
 check(args.length===6,'Three explicit options are required');
 for(let i=0;i<args.length;i+=2){check(['--project','--env-file','--output-directory'].includes(args[i])&&!options[args[i]]&&args[i+1],'Invalid option');options[args[i]]=args[i+1];}
 check(options['--project']===PROJECT,'Exact production project required');
 const envPath=options['--env-file'];check(isAbsolute(envPath),'Absolute protected environment file required');
 const info=await lstat(envPath);check(info.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'Environment file must be private and owned');
 const config=JSON.parse(await readFile(envPath,'utf8'));const url=new URL(config.BETTER_AUTH_DATABASE_URL);
 check(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname==='aws-1-us-east-1.pooler.supabase.com'&&url.port==='5432'&&url.pathname==='/postgres'&&decodeURIComponent(url.username)===`livestocks_auth_backend.${PROJECT}`&&!url.hash,'Backend credential is not the exact final project/role');
 check([...url.searchParams.keys()].every(name=>name==='sslmode')&&(!url.searchParams.has('sslmode')||url.searchParams.get('sslmode')==='verify-full'),'Unsupported database overrides');
 const directory=await safeBackupDirectory(options['--output-directory']);const dir=await lstat(directory);check(dir.uid===process.getuid()&&(dir.mode&0o077)===0,'Output directory must be private');
 const source=await readFile(new URL('../supabase/migrations/20261114151506_better_auth_private_sessions.sql',import.meta.url),'utf8');
 const prefix=authPrefix(source);const sql=preprovisionAuthSql(source,{backendPassword:decodeURIComponent(url.password)});
 await writeFile(join(directory,'00-preprovision-owner-store.sql'),sql,{mode:0o600,flag:'wx'});
 await writeFile(join(directory,'owner-store-preparation.json'),JSON.stringify({status:'PREPARED_NOT_EXECUTED',project:PROJECT,authSourceSha256:AUTH_SOURCE_SHA256,authPrefixSha256:sha256(prefix),sqlSha256:sha256(sql),authTables:13,financialChanges:false},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:'PREPARED_NOT_EXECUTED',project:PROJECT,authTables:13,financialChanges:false,secretsPrinted:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Owner-store preparation failed; no SQL executed and sensitive diagnostics suppressed.');process.exitCode=1;});
