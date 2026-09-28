import { afterEach, describe, expect, it } from 'vitest';
import { readVersion } from '../src/config.js';
import { setup } from './helpers.js';

let env;
afterEach(async () => env?.cleanup());

describe('/api/health', () => {
  it('vraća status i verziju bez prijave', async () => {
    env = setup();
    const res = await env.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', version: readVersion() });
  });

  it('nepoznata API putanja traži prijavu, a posle prijave daje 404', async () => {
    env = setup();
    const res = await env.app.inject({ method: 'GET', url: '/api/nema' });
    expect(res.statusCode).toBe(401);
  });
});
