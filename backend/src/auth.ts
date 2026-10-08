import { betterAuth } from 'better-auth';
import { APIError as AuthError } from 'better-auth/api';
import { anonymous, bearer, emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Env } from './types';
export function createAuth(env:Env) {
  return betterAuth({
    appName:'The Dreamer',baseURL:env.AUTH_BASE_URL,secret:env.BETTER_AUTH_SECRET,
    database:{db:new Kysely({dialect:new D1Dialect({database:env.DB})}),type:'sqlite'},
    trustedOrigins:[env.AUTH_BASE_URL,...env.ALLOWED_ORIGINS.split(',').map(v=>v.trim()),'dreamai://','dreamai://*'],
    emailAndPassword:{enabled:false},
    session:{expiresIn:60*60*24*90,updateAge:60*60*24},
    rateLimit:{enabled:true,storage:'database',window:60,max:50,customRules:{'/sign-in/anonymous':{window:60,max:5},'/email-otp/send-verification-otp':{window:60,max:3},'/sign-in/email-otp':{window:60,max:6}}},
    advanced:{useSecureCookies:env.AUTH_BASE_URL.startsWith('https://')},
    logger:{disabled:true},
    plugins:[expo(),bearer({requireSignature:true}),anonymous({
      onLinkAccount:async ({anonymousUser,newUser})=>{
        const oldID=anonymousUser.user.id;const newID=newUser.user.id;
        if(oldID===newID)return;
        // D1 batch is transactional. R2 keys are entry-scoped, so the media never moves.
        try {await env.DB.batch([
          // The verified old session proves this payment identity belongs to the journal being linked.
          env.DB.prepare('UPDATE billing_identities SET owner_id=? WHERE owner_id=?').bind(newID,oldID),
          env.DB.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?) ON CONFLICT(revenuecat_id) DO UPDATE SET owner_id=excluded.owner_id WHERE billing_identities.owner_id=?').bind(oldID,newID,Date.now(),oldID),
          env.DB.prepare("UPDATE dreams SET user_id=?,processing_status=CASE WHEN processing_status='processing' THEN 'error' ELSE processing_status END,error=CASE WHEN processing_status='processing' THEN 'Your journal was recovered. Restart processing when you are ready.' ELSE error END,lease_token=NULL,lease_until=NULL WHERE user_id=?").bind(newID,oldID),
          env.DB.prepare('INSERT INTO ai_usage(user_id,used) SELECT ?,used FROM ai_usage WHERE user_id=? ON CONFLICT(user_id) DO UPDATE SET used=used+excluded.used').bind(newID,oldID),
          env.DB.prepare('UPDATE ai_reservations SET user_id=? WHERE user_id=?').bind(newID,oldID),
          env.DB.prepare('DELETE FROM ai_usage WHERE user_id=?').bind(oldID)
        ]);}catch(error){
          if(error instanceof Error && error.message.includes('billing_identity_limit'))throw new AuthError('BAD_REQUEST',{message:'This account has reached its journal recovery limit. Your guest journal is preserved. Contact support to recover additional journals.'});
          throw error;
        }
      }
    }),emailOTP({otpLength:6,expiresIn:300,allowedAttempts:3,storeOTP:'hashed',sendVerificationOTP:async ({email,otp,type})=>{
      if(type!=='sign-in')throw new Error('Only passwordless sign-in is supported.');
      if(!env.EMAIL)throw new Error('Email delivery is unavailable.');
      await env.EMAIL.send({to:email,from:env.EMAIL_FROM,subject:'Your The Dreamer sign-in code',text:`Your sign-in code is ${otp}. It expires in five minutes. If you did not request this code, ignore this email.`});
    }})]
  });
}
