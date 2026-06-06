/**
 * Pure, framework-free motion helpers for the living-world scene (B1).
 * Kept independent of Phaser so they are unit-testable; the scene supplies
 * collision checks and timing.
 */

export type MovementPattern =
  | { type: 'idle' }
  | { type: 'wander'; radius: number }
  | { type: 'patrol'; points: Array<[number, number]> };

export const DEFAULT_WANDER_RADIUS = 28;

export function parseMovementPattern(
  raw: Record<string, unknown> | null | undefined,
): MovementPattern | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  if (type === 'idle') return { type: 'idle' };
  if (type === 'wander') {
    const r = Number((raw as { radius?: unknown }).radius);
    return { type: 'wander', radius: Number.isFinite(r) && r > 0 ? r : DEFAULT_WANDER_RADIUS };
  }
  if (type === 'patrol') {
    const pts = (raw as { points?: unknown }).points;
    const ok = Array.isArray(pts) && pts.length > 0 && pts.every(
      p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'),
    );
    return ok ? { type: 'patrol', points: pts as Array<[number, number]> } : null;
  }
  return null;
}

export function defaultPatternForType(type: string): MovementPattern {
  return type === 'PERSON' ? { type: 'wander', radius: DEFAULT_WANDER_RADIUS } : { type: 'idle' };
}

export function resolvePattern(
  object: { type: string; movementPattern?: Record<string, unknown> | null },
): MovementPattern {
  return parseMovementPattern(object.movementPattern) ?? defaultPatternForType(object.type);
}

export function stepToward(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  maxStep: number,
): { x: number; y: number } {
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist === 0) return { x: target.x, y: target.y };
  return { x: cur.x + (dx / dist) * maxStep, y: cur.y + (dy / dist) * maxStep };
}

export function reached(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  epsilon = 1,
): boolean {
  return Math.hypot(target.x - cur.x, target.y - cur.y) <= epsilon;
}

export function pickWanderTarget(
  origin: { x: number; y: number },
  radius: number,
  rand: () => number,
): { x: number; y: number } {
  const angle = rand() * Math.PI * 2;
  const r = rand() * radius;
  return { x: origin.x + Math.cos(angle) * r, y: origin.y + Math.sin(angle) * r };
}

export function bobOffset(elapsedMs: number, amplitudePx: number, periodMs: number): number {
  return amplitudePx * Math.sin((2 * Math.PI * elapsedMs) / periodMs);
}

/**
 * Returns the target if it is free; otherwise probes 8 directions across
 * expanding rings and returns the first free offset. Falls back to the
 * target if nothing is free within `rings`.
 */
export function freeTileNear(
  target: { x: number; y: number },
  isBlocked: (x: number, y: number) => boolean,
  step = 24,
  rings = 3,
): { x: number; y: number } {
  if (!isBlocked(target.x, target.y)) return { x: target.x, y: target.y };
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let ring = 1; ring <= rings; ring++) {
    for (const [dx, dy] of dirs) {
      const x = target.x + dx * step * ring;
      const y = target.y + dy * step * ring;
      if (!isBlocked(x, y)) return { x, y };
    }
  }
  return { x: target.x, y: target.y };
}
