import { env as bindings } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import initial from '../migrations/0001_initial.sql?raw';
import billing from '../migrations/0002_billing_identities.sql?raw';
import cleanup from '../migrations/0003_audio_cleanup_leases.sql?raw';
import hardening from '../migrations/0004_sync_sources_storage.sql?raw';

it('upgrades existing text, voice, deleted media and reservations without losing legacy journal data',async()=>{
  const db=(bindings as unknown as {LEGACY_DB:D1Database}).LEGACY_DB;
  const statements=(sql:string)=>sql.replace(/^\s*--.*$/gm,'').split('\n').filter(value=>value.trim()).join(' ');
  for(const sql of [initial,billing,cleanup])await db.exec(statements(sql));
  await db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,0,?,?,1)').bind('legacy','Guest','legacy@example.invalid',Date.now(),Date.now()).run();
  await db.batch([
    db.prepare(`INSERT INTO dreams(id,user_id,title,transcript,original_text,dream_date,created_at,updated_at,audio_key) VALUES('voice','legacy','Voice','Original voice','Original voice','2026-10-08','2026-10-08T12:00:00+02:00','2026-10-08T13:00:00+02:00','legacy-voice')`),
    db.prepare(`INSERT INTO dreams(id,user_id,title,transcript,original_text,dream_date,created_at,updated_at,deleted_at) VALUES('deleted','legacy','','','','2026-10-08','2026-10-08T12:00:00Z','2026-10-08T12:00:00Z','2026-10-08T12:01:00Z')`),
    db.prepare(`INSERT INTO ai_usage(user_id,used) VALUES('legacy',1)`),
    db.prepare(`INSERT INTO ai_reservations(dream_id,user_id,charged) VALUES('voice','legacy',1)`),
    db.prepare(`INSERT INTO audio_cleanup(audio_key,created_at) VALUES('orphaned-audio',0)`),
  ]);
  await db.exec(statements(hardening));
  const rows=(await db.prepare('SELECT * FROM dreams ORDER BY sync_version').all()).results;
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({id:'voice',original_text:'Original voice',audio_key:'legacy-voice',created_at:'2026-10-08T10:00:00.000Z',updated_at:'2026-10-08T11:00:00.000Z',source_version:1,sync_version:1,transcript_audio_key:'legacy-voice'});
  expect(rows[1]).toMatchObject({id:'deleted',sync_version:2,deleted_at:'2026-10-08T12:01:00Z'});
  expect(await db.prepare('SELECT * FROM ai_reservations').first()).toMatchObject({dream_id:'voice',source_hash:'',legacy_source_version:1,charged:1});
  expect(await db.prepare('SELECT bytes FROM audio_usage WHERE owner_id=?').bind('legacy').first()).toEqual({bytes:25*1024*1024});
  expect(await db.prepare('SELECT bytes FROM audio_global_usage WHERE id=1').first()).toEqual({bytes:50*1024*1024});
  await db.prepare("UPDATE dreams SET title='Changed' WHERE id='voice'").run();
  expect(await db.prepare("SELECT sync_version FROM dreams WHERE id='voice'").first()).toEqual({sync_version:3});
});
