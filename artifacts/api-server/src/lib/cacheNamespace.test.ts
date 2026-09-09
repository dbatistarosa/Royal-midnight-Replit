import {describe,it,expect} from 'vitest';
import {cacheNamespace} from './cacheNamespace';
describe('cache isolation',()=>{
 const env={VERCEL_ENV:'production',DATABASE_URL:'postgresql://postgres.project_a:secret@pool.example:6543/postgres'};
 it('isolates preview from production',()=>expect(cacheNamespace(env)).not.toBe(cacheNamespace({...env,VERCEL_ENV:'preview'})));
 it('isolates Supabase projects on the same pooler',()=>expect(cacheNamespace(env)).not.toBe(cacheNamespace({...env,DATABASE_URL:env.DATABASE_URL.replace('project_a','project_b')})));
 it('keeps the same namespace after password rotation and never embeds credentials',()=>{const first=cacheNamespace(env);expect(first).toBe(cacheNamespace({...env,DATABASE_URL:env.DATABASE_URL.replace('secret','rotated')}));expect(first).not.toContain('secret');});
});
