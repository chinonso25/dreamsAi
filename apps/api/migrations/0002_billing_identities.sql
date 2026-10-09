CREATE TABLE IF NOT EXISTS billing_identities (
 revenuecat_id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_identities_owner ON billing_identities(owner_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS billing_identity_insert_limit BEFORE INSERT ON billing_identities
WHEN NOT EXISTS(SELECT 1 FROM billing_identities WHERE revenuecat_id=NEW.revenuecat_id)
BEGIN
 SELECT RAISE(ABORT,'billing_identity_limit') WHERE (SELECT COUNT(*) FROM billing_identities WHERE owner_id=NEW.owner_id)>=20;
END;
CREATE TRIGGER IF NOT EXISTS billing_identity_transfer_limit BEFORE UPDATE OF owner_id ON billing_identities
WHEN OLD.owner_id!=NEW.owner_id
BEGIN
 SELECT RAISE(ABORT,'billing_identity_limit') WHERE (SELECT COUNT(*) FROM billing_identities WHERE owner_id=NEW.owner_id)>=20;
END;
