import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TS_CONTRACTS = join(ROOT, 'frontend', 'src', 'app', 'core', 'api', 'generated', 'openapi-contracts.d.ts');

test('openapi-contracts.d.ts existe y contiene las interfaces clave del contrato (E5-9)', () => {
  assert.equal(existsSync(TS_CONTRACTS), true);
  const content = readFileSync(TS_CONTRACTS, 'utf-8');
  assert.match(content, /export interface ApiEnvelope/);
  assert.match(content, /export interface ErrorEnvelope/);
  assert.match(content, /export interface AuditListEnvelope/);
  assert.match(content, /export interface InstructorAttemptsListEnvelope/);
  assert.match(content, /export interface WorldPatchAckEnvelope/);
  assert.match(content, /export interface OpenApiPaths/);
  assert.match(content, /'\/api\/admin\/audit': 'GET'/);
  assert.match(content, /'\/api\/instructor\/attempts': 'GET'/);
});
