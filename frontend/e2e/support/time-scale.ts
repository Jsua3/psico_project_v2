/**
 * Factor global de tiempo del e2e: E2E_TIME_SCALE (1 por defecto).
 *
 * Los plazos del harness están escritos en ms de una máquina de desarrollo.
 * En el runner del CI sin GPU el WebGL va por software: el juego corre a
 * pocos fps, cada acción de Playwright espera a un hilo principal ocupado y
 * el recorrido completo tarda ~3-4x más. Ese entorno exporta
 * E2E_TIME_SCALE=4 en vez de parchear cada espera por separado.
 *
 * Solo se escalan plazos (timeouts, deadlines). Las duraciones físicas del
 * juego (pulsaciones, velocidad, tolerancias en px) no cambian con el equipo.
 */
export function parseTimeScale(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 1;
  const value = Number(raw);
  // < 1 acortaría plazos ya calibrados en local: sería inestable, no más rápido.
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`E2E_TIME_SCALE debe ser un número ≥ 1 (recibido: "${raw}")`);
  }
  return value;
}

export const E2E_TIME_SCALE = parseTimeScale(process.env['E2E_TIME_SCALE']);

/** Plazo base (ms en una máquina de desarrollo) → plazo en este equipo. */
export function scaled(ms: number): number {
  return Math.round(ms * E2E_TIME_SCALE);
}
