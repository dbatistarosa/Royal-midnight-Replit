import {createHash} from 'node:crypto';

/** Separate data and rate limits when preview and production share a Redis instance. */
export function cacheNamespace(env:Record<string,string|undefined>=process.env):string {
 let database='unconfigured';
 try{const url=new URL(env.DATABASE_URL??'');database=[url.hostname,url.username,url.pathname].join('/');}catch{/* Local setup may omit Postgres. */}
 const identity=createHash('sha256').update(database).digest('hex').slice(0,16);
 return `rm:v2:${env.VERCEL_ENV??env.NODE_ENV??'development'}:${identity}`;
}
