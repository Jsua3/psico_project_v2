import { LOBBY_ROOM, lobbyPose, nearestLobbyDoor } from './lobby-avatar.util';

describe('lobby-avatar.util', () => {
  it('camina mirando hacia su lado; quieto conserva la vista', () => {
    expect(lobbyPose(-0.3)).toEqual({ view: 'left', walking: true });
    expect(lobbyPose(0.3)).toEqual({ view: 'right', walking: true });
    expect(lobbyPose(0)).toEqual({ view: null, walking: false });
  });

  it('la puerta más cercana dentro del radio, o ninguna', () => {
    const doors = [{ x: 220 }, { x: 480 }, { x: 740 }];
    expect(nearestLobbyDoor(doors, 250)).toBe(doors[0]);
    expect(nearestLobbyDoor(doors, 470)).toBe(doors[1]);
    expect(nearestLobbyDoor(doors, 350)).toBeNull();
    expect(nearestLobbyDoor(doors, 350, 200)).toBe(doors[0]);
    expect(nearestLobbyDoor([], 0)).toBeNull();
  });

  it('la fachada del lobby mide 960×540 para el zoom entero', () => {
    expect(LOBBY_ROOM).toEqual({ width: 960, height: 540 });
  });
});
