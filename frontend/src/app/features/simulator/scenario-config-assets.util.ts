const SCENARIO_CONFIG_ASSET_KEYS: Record<string, string> = {
  'valoracion-comisaria': 'comisaria-familia',
  'comisaria-familia': 'comisaria-familia',
};

export function resolveScenarioConfigAssetKey(mapOrScenarioKey: string | undefined | null): string | null {
  const key = mapOrScenarioKey?.trim();
  if (!key) return null;
  return SCENARIO_CONFIG_ASSET_KEYS[key] ?? key;
}
