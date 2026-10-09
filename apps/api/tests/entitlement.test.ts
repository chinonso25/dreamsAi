import { env as bindings } from 'cloudflare:workers';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { premiumEntitlement } from '../src/processing';
import type { Env } from '../src/types';
const env={...bindings,REVENUECAT_SECRET_KEY:'test-only-key',REVENUECAT_PROJECT_ID:'50f990d7',REVENUECAT_ENTITLEMENT_ID:'entl647fbfef6e'} as unknown as Env;
const base='/v2/projects/50f990d7/customers/customer/active_entitlements';
afterEach(()=>vi.restoreAllMocks());
describe('RevenueCat V2 least-privilege access',()=>{
 it('uses the matching active entitlement as authoritative including iOS grace periods',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({items:[{entitlement_id:'entl647fbfef6e',expires_at:Date.now()-60000}],next_page:null}));
  expect(await premiumEntitlement(env,'customer')).toBe(true);
  expect(fetch).toHaveBeenCalledWith(`https://api.revenuecat.com${base}?limit=100`,expect.objectContaining({headers:{Authorization:'Bearer test-only-key',Accept:'application/json'},redirect:'manual'}));
 });
 it('denies inactive and missing customers',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({items:[{entitlement_id:'another',expires_at:null}],next_page:null})).mockResolvedValueOnce(new Response(null,{status:404}));
  expect(await premiumEntitlement(env,'customer')).toBe(false);expect(await premiumEntitlement(env,'missing')).toBe(false);
 });
 it('follows only same-customer pagination and finds later matches',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({items:[{entitlement_id:'other',expires_at:null}],next_page:`${base}?starting_after=other&limit=100`})).mockResolvedValueOnce(Response.json({items:[{entitlement_id:'entl647fbfef6e',expires_at:null}],next_page:null}));
  expect(await premiumEntitlement(env,'customer')).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('does not forward the secret through a malicious or different-customer next page',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({items:[],next_page:'https://untrusted.example/collect'}));
  await expect(premiumEntitlement(env,'customer')).rejects.toMatchObject({code:'PURCHASE_CHECK_UNAVAILABLE'});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('reports transport, malformed and denied checks as unavailable without granting access',async()=>{
  vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({unexpected:'body'})).mockResolvedValueOnce(new Response(null,{status:403}));
  for(let attempt=0;attempt<3;attempt++)await expect(premiumEntitlement(env,'customer')).rejects.toMatchObject({status:503,code:'PURCHASE_CHECK_UNAVAILABLE'});
 });

 it('checks only the current owner and their verified stored guest IDs',async()=>{
  const db=env.DB;
  for(const id of ['account','other-account'])await db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,1,?,?,0)').bind(id,'Reader',`${id}@example.invalid`,Date.now(),Date.now()).run();
  await db.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?)').bind('paid-old-guest','account',Date.now()).run();
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>Response.json({items:String(url).includes('/paid-old-guest/')?[{entitlement_id:'entl647fbfef6e',expires_at:null}]:[],next_page:null}));
  expect(await premiumEntitlement(env,'account')).toBe(true);fetch.mockClear();
  expect(await premiumEntitlement(env,'other-account')).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);expect(String(fetch.mock.calls[0][0])).toContain('/other-account/');
 });

 it('rejects HTTP redirects instead of forwarding billing credentials',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:302,headers:{Location:'https://untrusted.example/collect'}}));
  await expect(premiumEntitlement(env,'customer')).rejects.toMatchObject({code:'PURCHASE_CHECK_UNAVAILABLE'});expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1]?.redirect).toBe('manual');
 });
 it('keeps V1 compatibility when the project is not configured',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({subscriber:{entitlements:{Pro:{expires_date:null}}}}));
  expect(await premiumEntitlement({...env,REVENUECAT_PROJECT_ID:undefined},'customer')).toBe(true);expect(fetch.mock.calls[0][0]).toBe('https://api.revenuecat.com/v1/subscribers/customer');
 });
});
