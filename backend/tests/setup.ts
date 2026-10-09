import { env as bindings } from 'cloudflare:workers';
import { beforeAll,beforeEach } from 'vitest';
import type { Env } from '../src/types';
import migration from '../migrations/0001_initial.sql?raw';
import cleanupMigration from '../migrations/0003_audio_cleanup_leases.sql?raw';
import billingMigration from '../migrations/0002_billing_identities.sql?raw';
import hardeningMigration from '../migrations/0004_sync_sources_storage.sql?raw';
const env=bindings as unknown as Env;
const statements=(sql:string)=>sql.replace(/^\s*--.*$/gm,'').split('\n').filter(value=>value.trim()).join(' ');
beforeAll(async ()=>{for(const sql of [migration,billingMigration,cleanupMigration,hardeningMigration])await env.DB.exec(statements(sql));});
beforeEach(async ()=>{
 await env.DB.batch(['audio_objects','audio_usage','billing_identities','ai_reservations','dreams','ai_usage','session','account','verification','rateLimit','request_limits','audio_cleanup','user'].map(table=>env.DB.prepare(`DELETE FROM "${table}"`)));
 await env.DB.prepare('UPDATE journal_sync_clock SET value=0 WHERE id=1').run();
 const audio=await env.AUDIO.list();if(audio.objects.length)await env.AUDIO.delete(audio.objects.map(object=>object.key));
});
