import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'lib/db/package.json'));
const {Client}=require('pg');
const normalize=sql=>sql.replaceAll('\r','').trim();
const checksum=sql=>createHash('sha256').update(normalize(sql)).digest('hex');
const apply=process.argv.includes('--apply');
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL for the intended database; credentials are never logged.');
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
await client.connect();
try{
 const directory=path.join(root,'supabase/migrations');
 const files=(await fs.readdir(directory)).filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
 for(const file of files){
  const [,version,name]=file.match(/^(\d{14})_(.+)\.sql$/);
  const source=normalize(await fs.readFile(path.join(directory,file),'utf8'));
  await client.query('BEGIN');
  try{
   await client.query("SET LOCAL lock_timeout='10s'");
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('royal-midnight-schema',0))");
   const {rows:[exists]}=await client.query("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS present");
   if(!exists.present&&apply){
    await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
    await client.query('CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text)');
   }
   const history=exists.present||apply?(await client.query('SELECT version,statements FROM supabase_migrations.schema_migrations WHERE name=$1',[name])).rows:[];
   if(history.length>1)throw new Error('Duplicate migration name: '+name);
   if(history.length){
    if(checksum(history[0].statements.join('\n'))!==checksum(source))throw new Error('Migration drift: '+file);
    console.log('Verified',file,'remote version',history[0].version);
   }else if(apply){
    await client.query(source);
    await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,name,[source]]);
    console.log('Applied',file);
   }else{
    console.log('Pending',file);process.exitCode=1;
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
 }
}finally{await client.end();}
