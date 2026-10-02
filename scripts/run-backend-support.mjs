export function createBackendCommandEnv(args = [], baseEnv = {}) {
  const env = { ...baseEnv };
  if (args[0] === 'check' && !env.DJANGO_SETTINGS_MODULE) {
    env.DJANGO_SETTINGS_MODULE = 'psychosim.settings.base';
  }
  return env;
}
