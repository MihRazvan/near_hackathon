import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { open, rename, chmod, mkdir, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { ROOT, readPrivateFile } from './config.mjs';
import { assert } from './core.mjs';
const issuer='https://auth.openai.com';
const resource='https://api.openai.com/v1';
const scopes='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

export async function validateIdentity(idToken, keys, clientId, nonce) {
  const { payload } = await jwtVerify(idToken, keys, { issuer, audience: clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'nonce'] });
  if (!equal(payload.nonce, nonce) || typeof payload.sub !== 'string' || !payload.sub)
    throw new Error('OpenAI identity or nonce did not match this sign-in attempt.');
  return { issuer: payload.iss, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}

export async function createAuthServer({directory=join(ROOT,'.local/chatgpt-auth'),port=4389,fetchImpl=fetch}={}) {
const file=name=>join(directory,name);
const origin='http://127.0.0.1:'+port;
const callback=origin+'/auth/callback';
const csrf = randomBytes(32).toString('base64url');
const opaque = () => randomBytes(32).toString('base64url');
let attempt, discovery, jwks;

async function load(name) {
  try { return JSON.parse(await readPrivateFile(file(name))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(name, value) {
  const temporary = `${name}.${randomUUID()}.tmp`;
  const handle=await open(file(temporary),'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  try{await rename(file(temporary),file(name));await chmod(file(name),0o600);
    const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}}
  finally{await rm(file(temporary),{force:true});}
}
await mkdir(directory, {recursive:true, mode:0o700});
const stat=await lstat(directory);
assert(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_DIRECTORY_REQUIRED','OAuth credential directory must be owner-only');
let host = await load('host.json');
if (!host) {
  host = { hostId: 'urn:uuid:' + randomUUID(), createdAt: new Date().toISOString() };
  await save('host.json', host);
}
async function metadata() {
  if (discovery) return discovery;
  const response = await fetchImpl(issuer + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('OpenAI discovery is unavailable. Please try again.');
  const value = await response.json();
  if (value.issuer !== issuer || value.authorization_endpoint !== issuer + '/api/accounts/authorize'
    || value.token_endpoint !== issuer + '/api/accounts/oauth/token' || new URL(value.jwks_uri).origin !== issuer)
    throw new Error('OpenAI discovery endpoints did not match the documented issuer.');
  jwks = createRemoteJWKSet(new URL(value.jwks_uri));
  return discovery = value;
}

function page(message, connected = false) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Everywhere — local AI connection</title><style>body{font:17px/1.6 system-ui;max-width:640px;margin:10vh auto;padding:24px;color:#232924;background:#f5f4ef}h1{line-height:1.2}button{font:inherit;padding:12px 22px;border:0;border-radius:8px;background:#232924;color:white;cursor:pointer}small{display:block;margin-top:30px;color:#596157}</style><h1>Connect AI for local testing</h1><p>${message}</p><p>This connection uses your eligible ChatGPT plan for text and image analysis, within your plan limits. It does not expose your ChatGPT conversations, memories, blockchain wallets or keys.</p>${connected ? '<p>You can close this tab. Access can be managed in ChatGPT settings.</p>' : ''}${`<form method="post" action="/auth/start"><input type="hidden" name="csrf" value="${csrf}"><button>Continue with ChatGPT</button></form>`}<small>Local development setup only. Image generation is not supported through this plan-usage route. This does not change marketplace wallet sign-in or the public website.</small></html>`;
}

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // no-referrer makes Chromium serialize a normal form POST's Origin as
    // "null". Keep same-origin submissions identifiable; suppress callback
    // referrers separately so authorization codes cannot leak on redirects.
    res.setHeader('Referrer-Policy', req.url?.startsWith('/auth/callback') ? 'no-referrer' : 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://auth.openai.com; frame-ancestors 'none'; base-uri 'none'");
    const send = (status, html) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); };
    if (req.headers.host !== new URL(origin).host) return send(403, 'Use the 127.0.0.1 local address.');
    const url = new URL(req.url, origin);
    try {
      if (url.pathname === '/' && req.method === 'GET') {
        const existing = await load('credentials.json');
        return send(200, page(existing ? 'ChatGPT is already connected for this local project.' : 'Continue to OpenAI to sign in and approve access to your ChatGPT plan.', Boolean(existing)));
      }
      if (url.pathname === '/auth/start' && req.method === 'POST') {
        if (req.headers.origin !== origin) return send(403, 'Start sign-in from the local page.');
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(413, 'Request too large.'); }
        if (!equal(new URLSearchParams(raw).get('csrf'), csrf)) return send(403, 'Reload the local page and try again.');
        const endpoints = await metadata();
        const existing = await load('credentials.json');
        const verifier = opaque(), browser = opaque();
        attempt = { state: opaque(), nonce: opaque(), verifier, browser, issuedAt: Date.now(), clientId: existing?.client_id ?? null, subject: existing?.subject ?? null };
        const params = new URLSearchParams({ client_id: attempt.clientId ?? 'dynamic_agent_client', ext_agent_host_id: host.hostId,
          response_type: 'code', redirect_uri: callback, scope: scopes, resource, state: attempt.state, nonce: attempt.nonce,
          code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
        if (!existing) params.set('agent_name_hint', 'Everywhere Local Development');
        else if (existing.id_token) params.set('id_token_hint', existing.id_token);
        res.writeHead(303, { Location: endpoints.authorization_endpoint + '?' + params, 'Set-Cookie': `everywhere_oauth=${browser}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=900` });
        return res.end();
      }
      if (url.pathname === '/auth/callback' && req.method === 'GET') {
        const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map(value => value.trim().split('=')));
        if (!attempt || Date.now() - attempt.issuedAt > 900000 || !equal(url.searchParams.get('state'), attempt.state)
          || !equal(cookies.everywhere_oauth, attempt.browser)) return send(400, 'Sign-in attempt did not match. Return to the local setup page and retry.');
        const current = attempt; attempt = null;
        res.setHeader('Set-Cookie', 'everywhere_oauth=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0');
        if (url.searchParams.has('error')) return send(400, page('OpenAI did not grant access. No credentials were changed.'));
        const suppliedClientId = url.searchParams.get('client_id');
        if (current.clientId && suppliedClientId && suppliedClientId !== current.clientId) return send(400, 'Client registration did not match.');
        const clientId = current.clientId ?? suppliedClientId, code = url.searchParams.get('code');
        if (!clientId || clientId === 'dynamic_agent_client' || !code) return send(400, 'OpenAI did not return the required registration and authorization code.');
        const endpoints = await metadata();
        const response = await fetchImpl(endpoints.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: current.verifier, redirect_uri: callback, resource }),
          signal: AbortSignal.timeout(20000) });
        if (!response.ok) return send(400, page('OpenAI could not complete the token exchange. No credentials were changed. Start a fresh sign-in.'));
        const tokens = await response.json();
        const identity = await validateIdentity(tokens.id_token, jwks, clientId, current.nonce);
        if (current.subject && identity.subject !== current.subject) return send(400, 'Signed-in account did not match the saved account.');
        const granted = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : [];
        if (!granted.includes('chatgpt.tokens.use.direct') || !tokens.access_token || !tokens.refresh_token || tokens.token_type?.toLowerCase() !== 'bearer')
          return send(400, page('Sign-in succeeded, but renewable ChatGPT plan access was not granted. No credentials were saved.'));
        await save('credentials.json', { ...identity, client_id: clientId, ext_agent_host_id: host.hostId, access_token: tokens.access_token,
          refresh_token: tokens.refresh_token, id_token: tokens.id_token, token_type: tokens.token_type, expires_in: tokens.expires_in,
          earliest_refresh_at: tokens.earliest_refresh_at, scopes: granted, saved_at: new Date().toISOString() });
        await rm(file('credentials.json.refresh.lock'),{force:true});
        res.writeHead(303, { Location: '/' }); return res.end();
      }
      return send(404, 'Not found.');
    } catch {
      return send(400, page('The sign-in could not be verified. No replacement credentials were saved. Return here and start again.'));
    }
  });
}
