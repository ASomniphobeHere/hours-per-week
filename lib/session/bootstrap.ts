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
import { restore, save } from '@/lib/store/persist';
import { createSession, type FetchLike } from './client';

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
