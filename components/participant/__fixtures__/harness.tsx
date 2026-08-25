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
import { memoryStorage, save, type PersistedState, type StorageLike } from '@/lib/store/persist';
import { ParticipantProvider } from '@/lib/client/participant';

export function sessionState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    sessionId: 'sess-test',
    token: 'tok-test',
    packVersion: 'test',
    dayType: 'wd',
    stage: 's1',
    introSeen: true,
    answers: {},
    ...overrides,
  };
}

export interface Harness extends RenderResult {
  storage: StorageLike;
}

export function renderParticipant(
  children: ReactNode,
  options: { pack?: ContentPack; state?: PersistedState; storage?: StorageLike } = {},
): Harness {
  const pack = options.pack ?? minimalPack();
  const state = options.state ?? sessionState();
  const storage = options.storage ?? memoryStorage();
  save(storage, state);

  const result = render(
    <ParticipantProvider index={indexPack(pack)} initial={state} storage={storage}>
      {children}
    </ParticipantProvider>,
  );
  return { ...result, storage };
}
