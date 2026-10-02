import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ensureServer, main } from './api-e2e.mjs';

const EXPECTED_NONCE = 'A'.repeat(43);

function attestedResponse({ nonce = EXPECTED_NONCE, cacheControl = 'no-store' } = {}) {
  return {
    status: 401,
    headers: new Headers({
      'X-SIEP-Test-Environment': 'isolated',
      'X-SIEP-Test-Run': nonce,
      'Cache-Control': cacheControl,
    }),
  };
}

test('ensureServer rechaza un isolated estatico con nonce ajeno sin intentar login', async () => {
  let loginCalls = 0;
  const request = async (method, path) => {
    if (path === '/auth/login') loginCalls += 1;
    assert.equal(method, 'GET');
    assert.equal(path, '/auth/me');
    return attestedResponse({ nonce: 'B'.repeat(43) });
  };

  const accepted = await ensureServer({
    request,
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });

  assert.equal(accepted, false);
  assert.equal(loginCalls, 0);
});

test('ensureServer exige no-store y acepta solo los tres valores exactos', async () => {
  const wrongCache = await ensureServer({
    request: async () => attestedResponse({ cacheControl: 'public, max-age=60' }),
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });
  const accepted = await ensureServer({
    request: async () => attestedResponse(),
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });

  assert.equal(wrongCache, false);
  assert.equal(accepted, true);
});

test('main no envia credenciales hasta validar el nonce exacto del backend', async () => {
  const env = {
    SIEP_API_BASE: 'http://127.0.0.1:8093/api',
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_EXPECTED_ATTESTATION_NONCE: EXPECTED_NONCE,
    SIEP_API_ADMIN_EMAIL: 'admin@example.test',
    SIEP_API_ADMIN_PASSWORD: 'admin-secret',
    SIEP_API_PROFESOR_EMAIL: 'profesor@example.test',
    SIEP_API_PROFESOR_PASSWORD: 'profesor-secret',
    SIEP_API_ESTUDIANTE_EMAIL: 'estudiante@example.test',
    SIEP_API_ESTUDIANTE_PASSWORD: 'estudiante-secret',
  };
  let loginCalls = 0;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  let status;
  try {
    status = await main(env, async (url, request) => {
      if (url.endsWith('/auth/me')) {
        return {
          ...attestedResponse({ nonce: 'B'.repeat(43) }),
          text: async () => '',
        };
      }
      if (url.endsWith('/auth/login')) {
        loginCalls += 1;
        assert.equal(request.method, 'POST');
        return { status: 401, headers: new Headers(), text: async () => '' };
      }
      return { status: 401, headers: new Headers(), text: async () => '' };
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(status, 1);
  assert.equal(loginCalls, 0);
});
