import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({plugins:[cloudflareTest({
 miniflare:{compatibilityDate:'2026-10-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB','LEGACY_DB'],r2Buckets:['AUDIO'],bindings:{
  AUTH_BASE_URL:'https://api.thedreamer.app',BETTER_AUTH_SECRET:'test-only-secret-do-not-use-in-production-0123456789',ALLOWED_ORIGINS:'https://thedreamer.app',EMAIL_FROM:'hello@thedreamer.app',REVENUECAT_ENTITLEMENT:'Pro',FREE_AI_LIMIT:'3',OPENAI_API_KEY:'test-only-key'
 }}
})],test:{setupFiles:['./tests/setup.ts']}});
