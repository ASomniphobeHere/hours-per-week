/**
 * Renders a component under a real `ParticipantProvider` backed by an
 * in-memory store, so a component test exercises the same write-through path
 * §5 requires of the app: answer, persist, re-derive.
 */

import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { indexPack } from '@/lib/pack';
import type { ContentPack } from '@/lib/pack/types';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import {
  memoryStorage,
  save,
  STATE_VERSION,
  type PersistedState,
  type StorageLike,
} from '@/lib/store/persist';
import { ParticipantProvider } from '@/lib/client/participant';
import type { Event } from '@/lib/domain/types';

export function sessionState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    v: STATE_VERSION,
    sessionId: 'sess-test',
    token: 'tok-test',
    packVersion: 'test',
    dayType: 'wd',
    stage: 's1',
    introSeen: true,
    answers: {},
    authored: {},
    snapshots: {},
    ...overrides,
  };
}

export interface Harness extends RenderResult {
  storage: StorageLike;
}

export function renderParticipant(
  children: ReactNode,
  options: {
    pack?: ContentPack;
    state?: PersistedState;
    storage?: StorageLike;
    /** §5's reset. Defaults to a no-op: most components never call it. */
    reset?: () => Promise<void>;
    /** §10's sink. Stage 10 gives it a queue; a test gives it a spy. */
    onEvent?: (event: Event) => void;
  } = {},
): Harness {
  const pack = options.pack ?? minimalPack();
  const state = options.state ?? sessionState();
  const storage = options.storage ?? memoryStorage();
  const reset = options.reset ?? (() => Promise.resolve());
  save(storage, state);

  const result = render(
    <ParticipantProvider
      index={indexPack(pack)}
      initial={state}
      storage={storage}
      reset={reset}
      onEvent={options.onEvent}
    >
      {children}
    </ParticipantProvider>,
  );
  return { ...result, storage };
}
