/**
 * Step 8.7's storage — the rooms this browser has created.
 *
 * Runs in node against a plain object, because the module takes its storage as
 * an argument for exactly this reason: what is under test is the list's
 * discipline, not the DOM's.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  forgetRoom,
  rememberRoom,
  rememberedRooms,
  roomsSnapshot,
  ROOMS_KEPT,
  ROOMS_KEY,
  serverRoomsSnapshot,
  subscribeRooms,
  type RememberedRoom,
  type StorageLike,
} from './rooms';

function fakeStorage(seed?: unknown): StorageLike & { raw: () => string | null } {
  let value: string | null = seed === undefined ? null : JSON.stringify(seed);
  return {
    getItem: (key) => (key === ROOMS_KEY ? value : null),
    setItem: (key, next) => {
      if (key === ROOMS_KEY) value = next;
    },
    raw: () => value,
  };
}

function room(joinCode: string, createdAt: number): RememberedRoom {
  return { roomId: `room-${joinCode}`, joinCode, createdAt };
}

describe('rememberRoom', () => {
  it('keeps rooms newest first', () => {
    const storage = fakeStorage();
    rememberRoom(room('1111', 1_000), storage);
    rememberRoom(room('2222', 2_000), storage);
    rememberRoom(room('3333', 3_000), storage);

    expect(rememberedRooms(storage).map((r) => r.joinCode)).toEqual(['3333', '2222', '1111']);
  });

  it('does not list the same room twice', () => {
    const storage = fakeStorage();
    rememberRoom(room('1111', 1_000), storage);
    rememberRoom(room('1111', 5_000), storage);

    const rooms = rememberedRooms(storage);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.createdAt).toBe(5_000);
  });

  it('keeps the newest 20 and drops the rest', () => {
    const storage = fakeStorage();
    for (let i = 0; i < ROOMS_KEPT + 8; i += 1) {
      rememberRoom(room(String(1000 + i), i * 1_000), storage);
    }

    const rooms = rememberedRooms(storage);
    expect(rooms).toHaveLength(ROOMS_KEPT);
    // The oldest eight are gone, not the newest eight.
    expect(rooms[0]?.joinCode).toBe(String(1000 + ROOMS_KEPT + 7));
    expect(rooms.at(-1)?.joinCode).toBe(String(1000 + 8));
  });

  it('returns the list it just wrote, so a caller can hold it as state', () => {
    const storage = fakeStorage();
    rememberRoom(room('1111', 1_000), storage);
    const returned = rememberRoom(room('2222', 2_000), storage);

    expect(returned).toEqual(rememberedRooms(storage));
  });
});

describe('forgetRoom', () => {
  it('removes one room and leaves the others', () => {
    const storage = fakeStorage();
    rememberRoom(room('1111', 1_000), storage);
    rememberRoom(room('2222', 2_000), storage);

    expect(forgetRoom('room-1111', storage).map((r) => r.joinCode)).toEqual(['2222']);
    expect(rememberedRooms(storage).map((r) => r.joinCode)).toEqual(['2222']);
  });

  it('is a no-op on a room that was never remembered', () => {
    const storage = fakeStorage();
    rememberRoom(room('1111', 1_000), storage);

    expect(forgetRoom('room-9999', storage)).toHaveLength(1);
  });
});

describe('rememberedRooms', () => {
  it('is empty with no storage at all', () => {
    expect(rememberedRooms(null)).toEqual([]);
    expect(rememberRoom(room('1111', 1), null)).toHaveLength(1);
    expect(forgetRoom('room-1111', null)).toEqual([]);
  });

  it('is empty rather than throwing on a value that is not a list', () => {
    for (const seed of ['not json', '{"rooms":[]}', '42', 'null']) {
      const storage: StorageLike = { getItem: () => seed, setItem: () => {} };
      expect(rememberedRooms(storage)).toEqual([]);
    }
  });

  it('drops entries of the wrong shape and keeps the rest', () => {
    const storage = fakeStorage([
      room('1111', 1_000),
      { roomId: 'room-x' },
      { joinCode: '2222', createdAt: 2_000 },
      { roomId: '', joinCode: '3333', createdAt: 3_000 },
      { roomId: 'room-y', joinCode: '4444', createdAt: 'yesterday' },
      null,
      'nope',
      room('5555', 5_000),
    ]);

    expect(rememberedRooms(storage).map((r) => r.joinCode)).toEqual(['5555', '1111']);
  });

  it('survives a storage that throws on read and on write', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('site data blocked');
      },
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };

    expect(rememberedRooms(hostile)).toEqual([]);
    // The caller still gets its list; it just will not be there next time.
    expect(rememberRoom(room('1111', 1_000), hostile).map((r) => r.joinCode)).toEqual(['1111']);
  });
});

describe('the store face', () => {
  it('tells React when the list changes, and stops when unsubscribed', () => {
    const storage = fakeStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeRooms(listener);

    rememberRoom(room('1111', 1_000), storage);
    expect(listener).toHaveBeenCalledTimes(1);

    forgetRoom('room-1111', storage);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    rememberRoom(room('2222', 2_000), storage);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns one array by reference on the server, where there is no browser to ask', () => {
    // `useSyncExternalStore` compares snapshots by reference; a fresh array
    // here would re-render forever.
    expect(serverRoomsSnapshot()).toBe(serverRoomsSnapshot());
    expect(serverRoomsSnapshot()).toEqual([]);
    // Node has no `window`, so the client snapshot degrades to the same thing.
    expect(roomsSnapshot()).toEqual([]);
    expect(roomsSnapshot()).toBe(roomsSnapshot());
  });
});
