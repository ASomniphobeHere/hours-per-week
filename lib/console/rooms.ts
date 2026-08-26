/**
 * The rooms this browser has created (step 8.7).
 *
 * §6.2.1 makes `roomId` the only thing standing between a participant and the
 * stage flag, and §6.2.6's scope argument — one boolean, one room, one
 * supervised workshop — depends on it not being enumerable. So there is no
 * endpoint that lists rooms, and the facilitator's way back to one they
 * already opened is this: a list held in their own browser, written when they
 * create a room and never sent anywhere.
 *
 * Deliberately not `lib/store/persist.ts`. That module is participant state
 * keyed by session id, and **RD-2** is reason enough to keep console code out
 * of a module named for the session — a `roomId` must never end up beside a
 * participant's record.
 *
 * Nothing depends on this list. It is a convenience, so every path through it
 * degrades to an empty list rather than throwing: a private window, disabled
 * site data, a full quota, or a hand-edited value are all "no rooms
 * remembered" and none of them is an error worth a screen.
 *
 * The bottom half of the file is the `useSyncExternalStore` face of the same
 * data. The server cannot know what a browser remembers, so the list has to
 * arrive after hydration rather than during it — which is the problem that
 * hook exists for, and why the component holds no state of its own.
 */

export const ROOMS_KEY = 'hpw:facilitator:rooms';

/** Newest 20. A term of rehearsals should not grow the list without bound. */
export const ROOMS_KEPT = 20;

export interface RememberedRoom {
  roomId: string;
  joinCode: string;
  createdAt: number;
}

/** The two methods used, so a test can pass an object rather than a DOM. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * `localStorage` where there is one. Reached through a `try` because access
 * itself throws in a browser configured to block site data — the read has not
 * even happened yet at that point.
 */
export function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRememberedRoom(value: unknown): value is RememberedRoom {
  if (typeof value !== 'object' || value === null) return false;
  const room = value as Record<string, unknown>;
  return (
    typeof room.roomId === 'string' &&
    room.roomId.length > 0 &&
    typeof room.joinCode === 'string' &&
    typeof room.createdAt === 'number' &&
    Number.isFinite(room.createdAt)
  );
}

function readRaw(storage: StorageLike | null): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(ROOMS_KEY);
  } catch {
    return null;
  }
}

/**
 * Newest first, malformed entries dropped.
 *
 * Validated on the way out on the same reasoning as `isAnswerMap` in
 * `lib/store/answers.ts`: what comes back from storage is data of unknown
 * shape — an older build's, or a hand-edited one — and a list that assumed its
 * own shape would turn a stale key into a blank screen.
 */
function parseRooms(raw: string | null): RememberedRoom[] {
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isRememberedRoom)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, ROOMS_KEPT);
}

export function rememberedRooms(storage: StorageLike | null = defaultStorage()): RememberedRoom[] {
  return parseRooms(readRaw(storage));
}

function write(rooms: RememberedRoom[], storage: StorageLike | null): RememberedRoom[] {
  if (storage !== null) {
    try {
      storage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    } catch {
      // Quota, or a browser that reports a storage object and then refuses to
      // use it. The caller still gets the list it asked for; it just will not
      // be there next time.
    }
  }
  notify();
  return rooms;
}

/** Returns the list as it now stands, so a caller can hold it as state. */
export function rememberRoom(
  room: RememberedRoom,
  storage: StorageLike | null = defaultStorage(),
): RememberedRoom[] {
  const kept = rememberedRooms(storage).filter((existing) => existing.roomId !== room.roomId);
  return write([room, ...kept].slice(0, ROOMS_KEPT), storage);
}

export function forgetRoom(
  roomId: string,
  storage: StorageLike | null = defaultStorage(),
): RememberedRoom[] {
  return write(
    rememberedRooms(storage).filter((room) => room.roomId !== roomId),
    storage,
  );
}

/* ── The store face (§React) ────────────────────────────────────────────── */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeRooms(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `useSyncExternalStore` compares snapshots by reference and re-renders in a
 * loop if a fresh array comes back every call, so the parse is cached against
 * the raw string it came from. Re-reading storage each call is what keeps the
 * cache honest: a write from anywhere — this tab, a test's `beforeEach` — is a
 * different string, and a different string is the only thing that allocates.
 */
let cachedRaw: string | null = null;
let cachedRooms: RememberedRoom[] = [];
let everRead = false;

export function roomsSnapshot(): RememberedRoom[] {
  const raw = readRaw(defaultStorage());
  if (!everRead || raw !== cachedRaw) {
    everRead = true;
    cachedRaw = raw;
    cachedRooms = parseRooms(raw);
  }
  return cachedRooms;
}

/**
 * One frozen array, returned by reference. The server has no browser to ask,
 * and a snapshot that allocated would defeat the comparison the hook makes
 * during hydration.
 */
const NO_ROOMS: RememberedRoom[] = [];

export function serverRoomsSnapshot(): RememberedRoom[] {
  return NO_ROOMS;
}
