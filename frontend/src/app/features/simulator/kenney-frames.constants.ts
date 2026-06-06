/**
 * Kenney.nl asset frame indices for Phaser spritesheets.
 *
 * Tiny Town / Tiny Dungeon (tilemap_packed.png): 192×176 → 12 cols × 11 rows, 16×16 px tiles.
 *   Frame index = row * 12 + col
 *
 * RPG Urban Pack (tilemap_packed.png): 432×288 → 27 cols × 18 rows, 16×16 px tiles.
 *   Frame index = row * 27 + col
 *   Characters occupy columns 23–26 (4 cols).
 *   Each character uses 3 rows (3 walk directions × 4 frames):
 *     Row +0 = walk DOWN  │ Row +1 = walk SIDE (flipX for left) │ Row +2 = walk UP
 *   Character groups (row-0-indexed):
 *     Char 1 (orange/teal)   rows  0–2  │ Char 2 (orange/red)   rows  3–5
 *     Char 3 (blue/purple) ★ rows  6–8  ← player (professional look)
 *     Char 4 (brown/amber) ★ rows  9–11 ← patient NPC
 *     Char 5 (orange/lilac)  rows 12–14 │ Char 6 (dark/charcoal)★ rows 15–17 ← supervisor
 */
export const KenneyTownFrames = {
  /** Light wooden floor tile — row 1, col 4 of tiny-town packed */
  FLOOR_WOOD: 16,
  /** Stone floor tile — row 1, col 6 */
  FLOOR_STONE: 18,
  /** Horizontal wall segment */
  WALL_H: 0,
  /** Vertical wall segment */
  WALL_V: 12,
  /** Closed door tile */
  DOOR_CLOSED: 44,
  /** Open door tile */
  DOOR_OPEN: 45,
} as const;

export const KenneyDungeonFrames = {
  /** Door / gate icon for EXIT markers — row 0, col 6 (0×12+6=6) */
  DOOR: 6,
  /** Desk / table marker — row 6, col 0 (6×12+0=72) */
  DESK: 72,
  /** Chair / medical-cross marker — row 5, col 4 (5×12+4=64) */
  CHAIR: 64,
  /** Cabinet / chest marker — row 5, col 3 (5×12+3=63) */
  CABINET: 63,
  /** Plant / green decoration — row 9, col 0 (9×12+0=108) */
  PLANT: 108,
} as const;

export const KenneyCharFrames = {
  // ── Player: Char 3, blue/purple outfit (rows 6–8, cols 23–26 of RPG Urban Pack) ──
  // row 6 → DOWN:  6*27+23=185 … 188
  // row 7 → SIDE:  7*27+23=212 … 215  (set sprite.flipX=true when walking left)
  // row 8 → UP:    8*27+23=239 … 242
  PLAYER_WALK_DOWN:  [185, 186, 187, 188],
  PLAYER_WALK_RIGHT: [212, 213, 214, 215],
  PLAYER_WALK_LEFT:  [212, 213, 214, 215],  // same frames as right — flip sprite in code
  PLAYER_WALK_UP:    [239, 240, 241, 242],
  PLAYER_IDLE: 185,

  // ── Patient NPC: Char 4, brown/amber outfit (rows 9–11) — idle = 9*27+23 = 266 ──
  NPC_PATIENT_IDLE: 266,

  // ── Supervisor NPC: Char 6, dark/charcoal outfit (rows 15–17) — idle = 15*27+23 = 428 ──
  NPC_SUPERVISOR_IDLE: 428,
} as const;
