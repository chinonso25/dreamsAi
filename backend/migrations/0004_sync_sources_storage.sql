-- Existing journals are preserved. Unknown object sizes are charged at the previous
-- 25 MiB upload maximum until an authenticated read supplies authoritative R2 size.
ALTER TABLE dreams ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE dreams ADD COLUMN transcript_audio_key TEXT;
ALTER TABLE dreams ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0;
UPDATE dreams SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at);
UPDATE dreams SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes');
-- A legacy voice transcript belongs to its original recording, not a new text preview.
UPDATE dreams SET transcript_audio_key=audio_key WHERE audio_key IS NOT NULL AND transcript!='' AND original_text=transcript;

CREATE TABLE ai_reservations_v2 (
 dream_id TEXT NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_hash TEXT NOT NULL,
 legacy_source_version INTEGER,
 charged INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(dream_id,source_hash)
);
INSERT INTO ai_reservations_v2(dream_id,user_id,source_hash,legacy_source_version,charged)
 SELECT dream_id,user_id,'',1,charged FROM ai_reservations;
DROP TABLE ai_reservations;
ALTER TABLE ai_reservations_v2 RENAME TO ai_reservations;
CREATE INDEX ai_reservations_owner ON ai_reservations(user_id);

CREATE TABLE audio_objects (
 audio_key TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
 bytes INTEGER NOT NULL CHECK(bytes>=0)
);
CREATE INDEX audio_objects_owner ON audio_objects(owner_id);
INSERT INTO audio_objects(audio_key,owner_id,bytes)
 SELECT audio_key,user_id,26214400 FROM dreams WHERE audio_key IS NOT NULL;
INSERT OR IGNORE INTO audio_objects(audio_key,owner_id,bytes)
 SELECT audio_key,NULL,26214400 FROM audio_cleanup;
CREATE TABLE audio_usage (owner_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0));
INSERT INTO audio_usage(owner_id,bytes) SELECT owner_id,SUM(bytes) FROM audio_objects WHERE owner_id IS NOT NULL GROUP BY owner_id;
CREATE TABLE audio_global_usage (id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0));
INSERT INTO audio_global_usage(id,bytes) SELECT 1,COALESCE(SUM(bytes),0) FROM audio_objects;
CREATE TRIGGER audio_objects_insert AFTER INSERT ON audio_objects
BEGIN
 UPDATE audio_global_usage SET bytes=bytes+NEW.bytes WHERE id=1;
 INSERT OR IGNORE INTO audio_usage(owner_id,bytes) SELECT NEW.owner_id,0 WHERE NEW.owner_id IS NOT NULL;
 UPDATE audio_usage SET bytes=bytes+NEW.bytes WHERE owner_id=NEW.owner_id;
END;
CREATE TRIGGER audio_objects_delete AFTER DELETE ON audio_objects
BEGIN
 UPDATE audio_global_usage SET bytes=bytes-OLD.bytes WHERE id=1;
 UPDATE audio_usage SET bytes=bytes-OLD.bytes WHERE owner_id=OLD.owner_id;
END;
CREATE TRIGGER audio_objects_update AFTER UPDATE OF owner_id,bytes ON audio_objects
BEGIN
 UPDATE audio_global_usage SET bytes=bytes-OLD.bytes+NEW.bytes WHERE id=1;
 UPDATE audio_usage SET bytes=bytes-OLD.bytes WHERE owner_id=OLD.owner_id;
 INSERT OR IGNORE INTO audio_usage(owner_id,bytes) SELECT NEW.owner_id,0 WHERE NEW.owner_id IS NOT NULL;
 UPDATE audio_usage SET bytes=bytes+NEW.bytes WHERE owner_id=NEW.owner_id;
END;

CREATE TABLE journal_sync_clock (id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL);
CREATE TABLE journal_sync_backfill (version INTEGER PRIMARY KEY AUTOINCREMENT,dream_id TEXT NOT NULL UNIQUE);
INSERT INTO journal_sync_backfill(dream_id) SELECT id FROM dreams ORDER BY rowid;
UPDATE dreams SET sync_version=(SELECT version FROM journal_sync_backfill WHERE dream_id=dreams.id);
INSERT INTO journal_sync_clock(id,value) SELECT 1,COALESCE(MAX(version),0) FROM journal_sync_backfill;
DROP TABLE journal_sync_backfill;
CREATE INDEX dreams_owner_sync ON dreams(user_id,sync_version);
CREATE TRIGGER dreams_sync_insert AFTER INSERT ON dreams
BEGIN
 UPDATE journal_sync_clock SET value=value+1 WHERE id=1;
 UPDATE dreams SET sync_version=(SELECT value FROM journal_sync_clock WHERE id=1) WHERE id=NEW.id;
END;
CREATE TRIGGER dreams_sync_update AFTER UPDATE OF user_id,title,transcript,original_text,summary,tags,keywords,mood,dream_date,created_at,updated_at,is_starred,audio_key,audio_length,processing_status,error,deleted_at,reflection ON dreams
BEGIN
 UPDATE journal_sync_clock SET value=value+1 WHERE id=1;
 UPDATE dreams SET sync_version=(SELECT value FROM journal_sync_clock WHERE id=1) WHERE id=NEW.id;
END;
