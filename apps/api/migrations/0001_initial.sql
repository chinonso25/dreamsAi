PRAGMA foreign_keys = ON;
CREATE TABLE "user" ("id" TEXT PRIMARY KEY NOT NULL,"name" TEXT NOT NULL,"email" TEXT NOT NULL UNIQUE,"emailVerified" INTEGER NOT NULL DEFAULT 0,"image" TEXT,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL,"isAnonymous" INTEGER DEFAULT 0);
CREATE TABLE "session" ("id" TEXT PRIMARY KEY NOT NULL,"expiresAt" INTEGER NOT NULL,"token" TEXT NOT NULL UNIQUE,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL,"ipAddress" TEXT,"userAgent" TEXT,"userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE);
CREATE INDEX session_user ON "session"("userId");
CREATE TABLE "account" ("id" TEXT PRIMARY KEY NOT NULL,"accountId" TEXT NOT NULL,"providerId" TEXT NOT NULL,"userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,"accessToken" TEXT,"refreshToken" TEXT,"idToken" TEXT,"accessTokenExpiresAt" INTEGER,"refreshTokenExpiresAt" INTEGER,"scope" TEXT,"password" TEXT,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL);
CREATE INDEX account_user ON "account"("userId");
CREATE TABLE "verification" ("id" TEXT PRIMARY KEY NOT NULL,"identifier" TEXT NOT NULL,"value" TEXT NOT NULL,"expiresAt" INTEGER NOT NULL,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL);
CREATE INDEX verification_identifier ON "verification"("identifier");
CREATE TABLE "rateLimit" ("id" TEXT PRIMARY KEY NOT NULL,"key" TEXT UNIQUE NOT NULL,"count" INTEGER NOT NULL,"lastRequest" INTEGER NOT NULL);
CREATE TABLE dreams (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 title TEXT NOT NULL, transcript TEXT NOT NULL DEFAULT '', original_text TEXT NOT NULL DEFAULT '',
 summary TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', keywords TEXT NOT NULL DEFAULT '[]', mood TEXT NOT NULL DEFAULT 'neutral',
 dream_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_starred INTEGER NOT NULL DEFAULT 0,
 audio_key TEXT, audio_length REAL NOT NULL DEFAULT 0, processing_status TEXT NOT NULL DEFAULT 'idle', error TEXT,
 revision INTEGER NOT NULL DEFAULT 1, processed_revision INTEGER, lease_token TEXT, lease_until INTEGER, deleted_at TEXT,
 reflection TEXT NOT NULL DEFAULT ''
);
CREATE INDEX dreams_owner_date ON dreams(user_id,deleted_at,dream_date DESC,created_at DESC);
CREATE TABLE ai_usage (user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE request_limits (key TEXT PRIMARY KEY NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE audio_cleanup (audio_key TEXT PRIMARY KEY NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE ai_reservations (dream_id TEXT PRIMARY KEY NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,charged INTEGER NOT NULL DEFAULT 0);
