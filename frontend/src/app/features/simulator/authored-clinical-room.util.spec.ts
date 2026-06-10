import {
  AUTHORED_CLINICAL_COLLISIONS,
  AUTHORED_MARKER_POSITIONS,
  AUTHORED_NPC_POSITIONS,
  AUTHORED_PLAYER_SPAWN,
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
  authoredMarkerPosition,
  collidesInAuthoredRoom,
  isAuthoredClinicalRoomKey,
} from './authored-clinical-room.util';

describe('authored clinical room routing', () => {
  it('routes the emergency room away from the legacy Tiled hospital map', () => {
    expect(isAuthoredClinicalRoomKey('map-urgencias-sala')).toBe(true);
    expect(isAuthoredClinicalRoomKey('urgencias-crisis')).toBe(true);
  });

  it('keeps the comisaria pilot on its own authored route', () => {
    expect(isAuthoredClinicalRoomKey('map-comisaria-sala-espera')).toBe(false);
  });
});

describe('authored clinical room geometry', () => {
  it('spawns the player on free floor', () => {
    expect(collidesInAuthoredRoom(AUTHORED_PLAYER_SPAWN.x, AUTHORED_PLAYER_SPAWN.y)).toBe(false);
  });

  it('lets the player take a first step in every direction from spawn', () => {
    const { x, y } = AUTHORED_PLAYER_SPAWN;
    expect(collidesInAuthoredRoom(x - 6, y)).toBe(false);
    expect(collidesInAuthoredRoom(x + 6, y)).toBe(false);
    expect(collidesInAuthoredRoom(x, y - 6)).toBe(false);
    expect(collidesInAuthoredRoom(x, y + 6)).toBe(false);
  });

  it('blocks walking into the walls and the desk', () => {
    expect(collidesInAuthoredRoom(480, 200)).toBe(true);   // pared del fondo
    expect(collidesInAuthoredRoom(40, 400)).toBe(true);    // pared izquierda
    expect(collidesInAuthoredRoom(930, 400)).toBe(true);   // pared derecha
    expect(collidesInAuthoredRoom(480, 300)).toBe(true);   // escritorio
  });

  it('keeps every marker inside the room and reachable (no collision at its hint spot)', () => {
    for (const [key, pos] of Object.entries(AUTHORED_MARKER_POSITIONS)) {
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.x).toBeLessThan(AUTHORED_ROOM_WIDTH);
      expect(pos.y).toBeGreaterThan(0);
      expect(pos.y).toBeLessThan(AUTHORED_ROOM_HEIGHT);
      // El jugador debe poder pararse a ≤60px del marcador sin colisionar:
      // probamos un anillo de posiciones candidatas alrededor.
      const reachable = [
        [pos.x, pos.y + 52], [pos.x, pos.y - 52],
        [pos.x + 52, pos.y], [pos.x - 52, pos.y],
        [pos.x, pos.y], [pos.x + 38, pos.y + 38], [pos.x - 38, pos.y + 38],
      ].some(([cx, cy]) => !collidesInAuthoredRoom(cx, cy));
      if (!reachable) throw new Error(`marker ${key} no es alcanzable`);
    }
  });

  it('keeps every NPC reachable for dialogue (free spot within talk range)', () => {
    for (const pos of AUTHORED_NPC_POSITIONS) {
      const reachable = [
        [pos.x, pos.y + 50], [pos.x, pos.y - 50],
        [pos.x + 50, pos.y], [pos.x - 50, pos.y],
        [pos.x, pos.y],
      ].some(([cx, cy]) => !collidesInAuthoredRoom(cx, cy));
      expect(reachable).toBe(true);
    }
  });

  it('resolves marker overrides by backend key', () => {
    expect(authoredMarkerPosition('escucha-segura')).not.toBeNull();
    expect(authoredMarkerPosition('clave-inexistente')).toBeNull();
  });
});
