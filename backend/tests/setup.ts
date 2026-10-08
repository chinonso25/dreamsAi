import { env as bindings } from 'cloudflare:workers';
import { beforeAll,beforeEach } from 'vitest';
import type { Env } from '../src/types';
import migration from '../migrations/0001_initial.sql?raw';
import cleanupMigration from '../migrations/0003_audio_cleanup_leases.sql?raw';
import billingMigration from '../migrations/0002_billing_identities.sql?raw';
const env=bindings as unknown as Env;
beforeAll(async ()=>{await env.DB.exec(migration.split('\n').filter(v=>v.trim()).join(' '));await env.DB.exec(billingMigration.split('\n').filter(v=>v.trim()).join(' '));await env.DB.exec(cleanupMigration);});
beforeEach(async ()=>{
 await env.DB.batch(['billing_identities','ai_reservations','dreams','ai_usage','session','account','verification','rateLimit','request_limits','audio_cleanup','user'].map(table=>env.DB.prepare(`DELETE FROM "${table}"`)));
 const audio=await env.AUDIO.list();if(audio.objects.length)await env.AUDIO.delete(audio.objects.map(object=>object.key));
});
