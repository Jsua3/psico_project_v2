/**
 * Pure, framework-free editors for an object's movementPattern Record.
 * Shapes match scene-motion.util.MovementPattern: idle | wander{radius} | patrol{points}.
 * Each function returns a NEW pattern object (immutable); safe on malformed input.
 */
export type Pattern = Record<string, unknown>;
export type Point = [number, number];

export function patrolPoints(pattern: Pattern | null | undefined): Point[] {
  const pts = (pattern as { points?: unknown })?.points;
  if (!Array.isArray(pts)) return [];
  return pts.filter(
    (p): p is Point => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'),
  );
}

export function wanderRadius(pattern: Pattern | null | undefined): number {
  const r = Number((pattern as { radius?: unknown })?.radius);
  return Number.isFinite(r) && r > 0 ? r : 28;
}

export function setPatternType(pattern: Pattern, type: 'idle' | 'wander' | 'patrol'): Pattern {
  if (type === 'idle') return { type: 'idle' };
  if (type === 'wander') return { type: 'wander', radius: wanderRadius(pattern) };
  return { type: 'patrol', points: patrolPoints(pattern) };
}

export function setWanderRadius(pattern: Pattern, radius: number): Pattern {
  const r = Number.isFinite(radius) && radius >= 1 ? Math.round(radius) : 1;
  return { type: 'wander', radius: r };
}

export function withPatrolPoint(pattern: Pattern, x: number, y: number): Pattern {
  return { type: 'patrol', points: [...patrolPoints(pattern), [x, y]] };
}

export function movePatrolPoint(pattern: Pattern, idx: number, x: number, y: number): Pattern {
  const points = patrolPoints(pattern).map((p, i): Point => (i === idx ? [x, y] : p));
  return { type: 'patrol', points };
}

export function removePatrolPoint(pattern: Pattern, idx: number): Pattern {
  return { type: 'patrol', points: patrolPoints(pattern).filter((_, i) => i !== idx) };
}

export function reorderPatrolPoint(pattern: Pattern, idx: number, dir: 1 | -1): Pattern {
  const points = patrolPoints(pattern);
  const j = idx + dir;
  if (idx < 0 || idx >= points.length || j < 0 || j >= points.length) return pattern;
  const next = [...points];
  [next[idx], next[j]] = [next[j], next[idx]];
  return { type: 'patrol', points: next };
}
