export type Heart = 'full' | 'half' | 'empty';

/**
 * Convierte stressIndex (0..100) en una fila de `total` corazones que representan
 * la CALMA restante (100 - stress): stress 0 → todos llenos; stress 100 → vacíos.
 * Medio corazón para el tramo intermedio. Entradas no finitas → todos vacíos.
 */
export function stressToHearts(stressIndex: number, total = 5): Heart[] {
  const stress = Number.isFinite(stressIndex)
    ? Math.min(100, Math.max(0, stressIndex))
    : 100;
  const calm = 100 - stress;
  const step = 100 / total;
  const full = Math.floor(calm / step);
  const rem = calm - full * step;
  const half = rem >= step / 2 ? 1 : 0;
  const hearts: Heart[] = [];
  for (let i = 0; i < total; i++) {
    if (i < full) hearts.push('full');
    else if (i === full && half) hearts.push('half');
    else hearts.push('empty');
  }
  return hearts;
}
