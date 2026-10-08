import { env as bindings } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyseDream } from '../src/openai';
import { transcribeDream } from '../src/transcription';
import { processDream } from '../src/processing';
import { ownedDream, saveDream } from '../src/database';
import { dreamInput } from '../src/validation';
import type { Env } from '../src/types';
const env = { ...bindings, AI: { run: vi.fn() } } as unknown as Env;
const id = '4a27632a-fc7a-4b79-b532-96b724193ade';
const insight = { title: 'The sea', summary: 'Swimming in the sea.', tags: ['water'], keywords: ['sea'], mood: 'curious' };
function response(status = 'completed', text = JSON.stringify(insight)) {
  return Response.json({ status, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
}
async function seedAudio() {
  await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,0,?,?,1)').bind('owner', 'Guest', 'owner@example.invalid', Date.now(), Date.now()).run();
  await saveDream(env, id, 'owner', dreamInput.parse({ dream_date: '2026-10-08' }));
  await env.AUDIO.put(`dreams/${id}/audio`, new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69]), { httpMetadata: { contentType: 'audio/wav' } });
  await env.DB.prepare('UPDATE dreams SET audio_key=? WHERE id=?').bind(`dreams/${id}/audio`, id).run();
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Luna and Cloudflare dream processing', () => {
  it('enforces the journal schema, disables storage and extra reasoning, and uses only server credentials', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    expect(await analyseDream(env, 'I swam in the sea.')).toEqual(insight);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options?.redirect).toBe('manual');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-only-key', 'Content-Type': 'application/json' });
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({ model: 'gpt-6-luna', store: false, reasoning: { effort: 'none' }, max_output_tokens: 1200, text: { format: { type: 'json_schema', strict: true, schema: { additionalProperties: false, required: ['title', 'summary', 'tags', 'keywords', 'mood'] } } } });
    expect(body.input[0].content).toBe(JSON.stringify({ dream: 'I swam in the sea.' }));
  });
  it('rejects incomplete, refused, malformed and invalid results instead of storing them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('incomplete'))
      .mockResolvedValueOnce(Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'declined' }] }] }))
      .mockResolvedValueOnce(response('completed', 'not JSON'))
      .mockResolvedValueOnce(response('completed', JSON.stringify({ ...insight, mood: 'invented' })));
    for (let attempt = 0; attempt < 4; attempt++) await expect(analyseDream(env, 'A dream')).rejects.toMatchObject({ code: 'INVALID_AI_RESULT' });
  });
  it('keeps provider errors private and does not automatically repeat a billable request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: { message: 'private dream and credentials' } }, { status: 429 }));
    await expect(analyseDream(env, 'A dream')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', message: 'Dream processing is temporarily unavailable. Your dream is saved; retry processing.' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects redirects without forwarding the key to another host', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/collect' } }));
    await expect(analyseDream(env, 'A dream')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1]?.redirect).toBe('manual');
  });
  it('aborts an interrupted provider request', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const check = expect(analyseDream(env, 'A dream')).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(75000); await check;
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('sends the original recording to Cloudflare Whisper Turbo without calling OpenAI transcription', async () => {
    await seedAudio();
    const run = vi.spyOn(env.AI, 'run').mockResolvedValue({ text: ' I swam in the sea. ' });
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(await transcribeDream(env, (await env.AUDIO.get(`dreams/${id}/audio`))!)).toBe('I swam in the sea.');
    expect(run.mock.calls[0][0]).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(run.mock.calls[0][1]).toEqual({ audio: 'UklGRgAAAABXQVZF', task: 'transcribe' });
    expect(run.mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains a completed transcript after analysis fails and reuses it on retry', async () => {
    await seedAudio();
    const run = vi.spyOn(env.AI, 'run').mockResolvedValue({ text: 'I swam in the sea.' });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response());
    const failed = await processDream(env, id, 'owner');
    expect(failed.dream.processing_status).toBe('error'); expect(failed.dream.transcript).toBe('I swam in the sea.');
    expect((await processDream(env, id, 'owner')).dream.processing_status).toBe('complete');
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://api.openai.com/v1/responses', 'https://api.openai.com/v1/responses']);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first<{ used: number }>())?.used).toBe(1);
  });
  it('does not put an empty transcript into a saved dream', async () => {
    await seedAudio();
    const run = vi.spyOn(env.AI, 'run').mockResolvedValue({ text: ' ' });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = await processDream(env, id, 'owner');
    expect(result.dream.processing_status).toBe('error'); expect(result.dream.transcript).toBe(''); expect(run).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps transcription provider failures private and makes no automatic retry', async () => {
    await seedAudio();
    const run = vi.spyOn(env.AI, 'run').mockRejectedValue(new Error('private recording and provider error'));
    await expect(transcribeDream(env, (await env.AUDIO.get(`dreams/${id}/audio`))!)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', message: 'Dream processing was interrupted. Your dream is saved; retry processing.' });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('aborts interrupted transcription through the binding', async () => {
    await seedAudio(); vi.useFakeTimers();
    vi.spyOn(env.AI, 'run').mockImplementation((_model, _input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const check = expect(transcribeDream(env, (await env.AUDIO.get(`dreams/${id}/audio`))!)).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(75000); await check;
  });
  it('does not reserve a preview or lease when the audio binding is missing', async () => {
    await seedAudio();
    await expect(processDream({ ...env, AI: undefined } as unknown as Env, id, 'owner')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect((await ownedDream(env, id, 'owner')).lease_token).toBeNull();
    expect(await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first()).toBeNull();
  });
  it('does not reserve a free preview or lease when no key is configured', async () => {
    await seedAudio(); const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(processDream({ ...env, OPENAI_API_KEY: undefined }, id, 'owner')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect(fetch).not.toHaveBeenCalled(); expect((await ownedDream(env, id, 'owner')).lease_token).toBeNull();
    expect(await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first()).toBeNull();
  });
});
