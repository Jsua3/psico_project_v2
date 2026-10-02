import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackendCommandEnv } from './run-backend-support.mjs';

test('el check de backend usa settings.base cuando local.py no existe', () => {
  const env = createBackendCommandEnv(['check'], { KEEP_ME: 'yes' });

  assert.equal(env.DJANGO_SETTINGS_MODULE, 'psychosim.settings.base');
  assert.equal(env.KEEP_ME, 'yes');
});

test('un settings explícito y los demás comandos conservan el entorno solicitado', () => {
  assert.equal(
    createBackendCommandEnv(['check'], { DJANGO_SETTINGS_MODULE: 'psychosim.settings.local' })
      .DJANGO_SETTINGS_MODULE,
    'psychosim.settings.local',
  );
  assert.equal(
    createBackendCommandEnv(['runserver'], {}).DJANGO_SETTINGS_MODULE,
    undefined,
  );
});
