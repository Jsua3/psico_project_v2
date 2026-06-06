/**
 * Pure get/set helpers for door metadata (EXIT objects) and room ambient (zoom/bg).
 * Operate on the free-form JSON Records (object.metadata, map.ambient); immutable + safe.
 */
export type Json = Record<string, unknown>;

// ─── Doors (stored in EXIT object's metadata) ────────────────────────────────
export function doorTarget(meta: Json | null | undefined): string {
  const v = (meta as { targetNodeKey?: unknown })?.targetNodeKey;
  return typeof v === 'string' ? v : '';
}
export function setDoorTarget(meta: Json, nodeKey: string): Json {
  return { ...meta, targetNodeKey: nodeKey };
}
export function doorEntry(meta: Json | null | undefined): [number, number] {
  const x = Number((meta as { entryX?: unknown })?.entryX);
  const y = Number((meta as { entryY?: unknown })?.entryY);
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}
export function setDoorEntry(meta: Json, x: number, y: number): Json {
  return { ...meta, entryX: x, entryY: y };
}

// ─── Room ambient (zoom + background, stored in map.ambient) ─────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
export function cameraZoom(ambient: Json | null | undefined): number {
  const z = Number((ambient as { cameraZoom?: unknown })?.cameraZoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}
export function setCameraZoom(ambient: Json, z: number): Json {
  return { ...ambient, cameraZoom: clamp(Number.isFinite(z) ? z : 1, 0.25, 4) };
}
export function backgroundImage(ambient: Json | null | undefined): string {
  const v = (ambient as { backgroundImage?: unknown })?.backgroundImage;
  return typeof v === 'string' ? v : '';
}
export function setBackgroundImage(ambient: Json, url: string): Json {
  const next = { ...ambient };
  if (url) next['backgroundImage'] = url; else delete next['backgroundImage'];
  return next;
}
