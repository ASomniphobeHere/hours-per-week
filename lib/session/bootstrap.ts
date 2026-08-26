/**
 * §5, §11 and AC 36 — the client calls `POST /session` exactly once per
 * participant.
 *
 * This is the reason §5 persists session identity alongside the answers.
 * `total` on the console counts session rows (§6.2.2); a refresh that mints a
 * second row inflates the one number the facilitator's decision rests on and
 * breaks `inStage` summing to it. So a stored `sessionId` + `token` short-
 * circuits creation unconditionally — including across a pack-version change,
 * where `restore` prunes answers but keeps the identity, because identity is
 * room membership rather than content.
 */

import type { PersistedState, StorageLike } from '@/lib/store/persist';
import { clear, restore, save } from '@/lib/store/persist';
import { ApiError, createSession, resetSession, type FetchLike } from './client';

export interface PackIdentity {
  version: string;
  fieldIds: Iterable<string>;
}

export interface BootstrapResult {
  state: PersistedState;
  /** False when a stored session was resumed — the AC 36 path. */
  created: boolean;
  /** True when answers were pruned against a new pack version (§5). */
  packChanged: boolean;
  dropped: string[];
  packUrl: string | null;
}

export interface BootstrapOptions {
  storage: StorageLike;
  pack: PackIdentity;
  /** Required only when there is no stored session to resume. */
  joinCode?: string;
  fetchImpl: FetchLike;
}

export async function ensureSession({
  storage,
  pack,
  joinCode,
  fetchImpl,
}: BootstrapOptions): Promise<BootstrapResult> {
  const restored = restore(storage, pack);
  if (restored !== null) {
    return {
      state: restored.state,
      created: false,
      packChanged: restored.packChanged,
      dropped: restored.dropped,
      packUrl: null,
    };
  }

  if (joinCode === undefined) throw new Error('joinCode required: no stored session to resume');

  const created = await createSession(joinCode, fetchImpl);
  const state: PersistedState = {
    sessionId: created.sessionId,
    token: created.token,
    packVersion: created.packVersion,
    // §7.1's default view, and §5 persists it so a refresh is invisible.
    dayType: 'wd',
    stage: 's1',
    introSeen: false,
    answers: {},
  };
  // Written before the participant answers anything: a refresh in the seconds
  // between joining and the first field is still a refresh (§11).
  save(storage, state);

  return { state, created: true, packChanged: false, dropped: [], packUrl: created.packUrl };
}

export interface ResetOptions {
  storage: StorageLike;
  /** The session being discarded — its credentials authorise its own deletion. */
  state: PersistedState;
  fetchImpl: FetchLike;
}

/**
 * §5's reset: destroy the session server-side, then locally, then start a new
 * one in the same room.
 *
 * The order is the whole of the error handling. Local state is cleared only
 * once the server has confirmed the delete, so a reset that fails on the
 * network costs the participant nothing and can simply be tapped again.
 *
 * The exception is a 401, which on this route means the row is already gone —
 * a second tap racing the first, or a token no longer matching anything. There
 * is nothing left to authorise a retry with, so the stored record is worthless
 * and keeping it would strand the participant on a session the server has
 * forgotten. It is cleared and `null` returned, which drops the client to the
 * join screen: one code re-entry, rather than a phone that can neither continue
 * nor reset.
 */
export async function resetToNewSession({
  storage,
  state,
  fetchImpl,
}: ResetOptions): Promise<PersistedState | null> {
  const credentials = { sessionId: state.sessionId, token: state.token };

  let created;
  try {
    created = await resetSession(credentials, fetchImpl);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clear(storage, state.sessionId);
      return null;
    }
    throw error;
  }

  clear(storage, state.sessionId);
  const next: PersistedState = {
    sessionId: created.sessionId,
    token: created.token,
    packVersion: created.packVersion,
    dayType: 'wd',
    stage: 's1',
    // A reset is a fresh participant, so §13's statement is unread again.
    introSeen: false,
    answers: {},
  };
  save(storage, next);
  return next;
}
