export type SiepInputMode = 'keyboard' | 'touch';

export const REQUIRED_VIEWPORTS = [
  { name: 'desktop-1600', width: 1600, height: 900, inputMode: 'keyboard' },
  { name: 'desktop-1366', width: 1366, height: 768, inputMode: 'keyboard' },
  { name: 'mobile-390', width: 390, height: 844, inputMode: 'touch' },
  { name: 'mobile-412', width: 412, height: 915, inputMode: 'touch' },
] as const satisfies ReadonlyArray<{
  name: string;
  width: number;
  height: number;
  inputMode: SiepInputMode;
}>;
