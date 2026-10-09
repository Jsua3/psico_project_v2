import { clearVisitedRooms, markRoomVisited, readVisitedRooms, visitedRoomsKey } from './visited-rooms.util';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

let counter = 0;
const nextAttempt = () => `intento-${++counter}`;

describe('visited-rooms.util', () => {
  it('la clave es aparte de siep_attempt_* y lleva versión del caso e intento', () => {
    expect(visitedRoomsKey(7, 'abc')).toBe('siep_rooms_7_abc');
    expect(visitedRoomsKey('v2', 'abc')).toBe('siep_rooms_v2_abc');
    expect(visitedRoomsKey(7, 'abc').startsWith('siep_attempt_')).toBe(false);
  });

  it('empieza vacío, marca salas y las recuerda sin duplicar', () => {
    const storage = new MemoryStorage();
    const attempt = nextAttempt();
    expect([...readVisitedRooms(1, attempt, storage)]).toEqual([]);
    markRoomVisited(1, attempt, 'urgencias', storage);
    const rooms = markRoomVisited(1, attempt, 'sala-escucha', storage);
    expect([...rooms]).toEqual(['urgencias', 'sala-escucha']);
    expect([...markRoomVisited(1, attempt, 'sala-escucha', storage)]).toEqual([...rooms]);
    expect([...readVisitedRooms(1, attempt, storage)]).toEqual(['urgencias', 'sala-escucha']);
    expect(JSON.parse(storage.data.get(visitedRoomsKey(1, attempt))!)).toEqual(['urgencias', 'sala-escucha']);
  });

  it('cada intento y cada versión del caso tienen su conjunto', () => {
    const storage = new MemoryStorage();
    const [a, b] = [nextAttempt(), nextAttempt()];
    markRoomVisited(1, a, 'recepcion', storage);
    expect(readVisitedRooms(1, b, storage).size).toBe(0);
    expect(readVisitedRooms(2, a, storage).size).toBe(0);
  });

  it('descarta salas desconocidas y datos dañados', () => {
    const storage = new MemoryStorage();
    const attempt = nextAttempt();
    const key = visitedRoomsKey(1, attempt);
    storage.setItem(key, '["urgencias","sala-secreta",3,null,"consultorio"]');
    expect([...readVisitedRooms(1, attempt, storage)]).toEqual(['urgencias', 'consultorio']);
    for (const raw of ['no es json', '{"a":1}', 'null', '""', '']) {
      storage.setItem(key, raw);
      expect(readVisitedRooms(1, attempt, storage).size).toBe(0);
    }
  });

  it('con getItem que lanza no se rompe: respaldo en memoria', () => {
    const attempt = nextAttempt();
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(readVisitedRooms(1, attempt, broken).size).toBe(0);
    expect(() => markRoomVisited(1, attempt, 'sala-escucha', broken)).not.toThrow();
    expect([...readVisitedRooms(1, attempt, broken)]).toEqual(['sala-escucha']);
    // Con otro almacenamiento, la memoria de la pestaña sigue valiendo para el mismo intento.
    expect([...readVisitedRooms(1, attempt, new MemoryStorage())]).toEqual(['sala-escucha']);
  });

  it('con setItem que lanza, lo marcado se recuerda en memoria', () => {
    const attempt = nextAttempt();
    const store = new MemoryStorage();
    const full = { getItem: store.getItem.bind(store), setItem: () => { throw new Error('cuota'); } };
    markRoomVisited(1, attempt, 'recepcion', full);
    expect(readVisitedRooms(1, attempt, full).has('recepcion')).toBe(true);
    expect(store.data.size).toBe(0);
  });

  it('clearVisitedRooms olvida el intento en el navegador y en memoria', () => {
    const storage = new MemoryStorage();
    const attempt = nextAttempt();
    markRoomVisited(1, attempt, 'urgencias', storage);
    clearVisitedRooms(1, attempt, storage);
    expect(storage.data.size).toBe(0);
    expect(readVisitedRooms(1, attempt, storage).size).toBe(0);
    expect(() => clearVisitedRooms(1, attempt, { removeItem: () => { throw new Error('x'); } })).not.toThrow();
  });

  it('sin almacenamiento inyectado usa sessionStorage y no se rompe si lanza', () => {
    const attempt = nextAttempt();
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    try {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => { throw new Error('SecurityError'); } });
      expect(() => readVisitedRooms(1, attempt)).not.toThrow();
      markRoomVisited(1, attempt, 'urgencias');
      expect(readVisitedRooms(1, attempt).has('urgencias')).toBe(true);
    } finally {
      Object.defineProperty(window, 'sessionStorage', original);
    }
    const other = nextAttempt();
    markRoomVisited(1, other, 'consultorio');
    expect(JSON.parse(window.sessionStorage.getItem(visitedRoomsKey(1, other))!)).toEqual(['consultorio']);
    clearVisitedRooms(1, other);
    expect(window.sessionStorage.getItem(visitedRoomsKey(1, other))).toBeNull();
  });
});
