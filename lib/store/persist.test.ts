import { describe, expect, it } from 'vitest';
import { setAnswer } from './answers';
import {
  CURRENT_KEY,
  clear,
  furthestStage,
  load,
  memoryStorage,
  restore,
  save,
  stateKey,
  type PersistedState,
} from './persist';

function state(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    sessionId: 'sess-1',
    token: 'tok-1',
    packVersion: 'v1',
    dayType: 'wd',
    stage: 's2',
    answers: setAnswer({}, 'sleep.wake.wd', '07:00', 100),
    ...overrides,
  };
}

describe('§5 persistence', () => {
  it('round-trips everything a refresh must not cost the participant', () => {
    const storage = memoryStorage();
    save(storage, state());
    expect(load(storage)).toEqual(state());
  });

  it('keys the record by session id, with a pointer naming the current session', () => {
    const storage = memoryStorage();
    save(storage, state());
    expect(storage.getItem(CURRENT_KEY)).toBe('sess-1');
    expect(storage.getItem(stateKey('sess-1'))).not.toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(load(memoryStorage())).toBeNull();
  });

  it('returns null when the pointer names a record that is gone', () => {
    const storage = memoryStorage({ [CURRENT_KEY]: 'sess-1' });
    expect(load(storage)).toBeNull();
  });

  it('returns null rather than throwing on a corrupt record', () => {
    const storage = memoryStorage({
      [CURRENT_KEY]: 'sess-1',
      [stateKey('sess-1')]: '{ not json',
    });
    expect(load(storage)).toBeNull();
  });

  it('rejects a record missing its session identity', () => {
    const storage = memoryStorage({
      [CURRENT_KEY]: 'sess-1',
      [stateKey('sess-1')]: JSON.stringify({ ...state(), token: '' }),
    });
    expect(load(storage)).toBeNull();
  });

  it('clears both keys', () => {
    const storage = memoryStorage();
    save(storage, state());
    clear(storage, 'sess-1');
    expect(load(storage)).toBeNull();
  });
});

describe('restore (§5, §11, AC 36)', () => {
  it('resumes at the furthest stage with the answers intact', () => {
    const storage = memoryStorage();
    save(storage, state({ stage: 's4', dayType: 'we' }));

    const result = restore(storage, { version: 'v1', fieldIds: ['sleep.wake.wd'] })!;
    expect(result.packChanged).toBe(false);
    expect(result.state.stage).toBe('s4');
    expect(result.state.dayType).toBe('we');
    expect(result.state.answers['sleep.wake.wd']!.value).toBe('07:00');
  });

  /* AC 36 — a refresh restores the existing session and creates no second row.
     `total` on the console counts session rows, so a duplicate breaks the one
     number the facilitator's decision rests on. */
  it('keeps the same session id and token across repeated restores', () => {
    const storage = memoryStorage();
    save(storage, state());

    for (let boot = 0; boot < 3; boot += 1) {
      const result = restore(storage, { version: 'v1', fieldIds: ['sleep.wake.wd'] })!;
      expect(result.state.sessionId).toBe('sess-1');
      expect(result.state.token).toBe('tok-1');
    }
  });

  it('returns null when there is nothing to restore, which is when a session is minted', () => {
    expect(restore(memoryStorage(), { version: 'v1', fieldIds: [] })).toBeNull();
  });
});

describe('restore across a pack version change (§5)', () => {
  it('keeps surviving answers, drops the rest, and resumes at S1', () => {
    const storage = memoryStorage();
    let answers = setAnswer({}, 'kept', 1, 1);
    answers = setAnswer(answers, 'gone', 2, 2);
    save(storage, state({ answers, stage: 's4' }));

    const result = restore(storage, { version: 'v2', fieldIds: ['kept'] })!;
    expect(result.packChanged).toBe(true);
    expect(result.dropped).toEqual(['gone']);
    expect(Object.keys(result.state.answers)).toEqual(['kept']);
    expect(result.state.stage).toBe('s1');
  });

  /* The session survives a pack change: it is room membership, not content, and
     re-minting it is exactly the duplicate row AC 36 forbids. */
  it('keeps the session identity', () => {
    const storage = memoryStorage();
    save(storage, state({ stage: 's3' }));
    const result = restore(storage, { version: 'v2', fieldIds: [] })!;
    expect(result.state.sessionId).toBe('sess-1');
    expect(result.state.token).toBe('tok-1');
  });

  it('writes the migrated record back, so a second boot is not a second migration', () => {
    const storage = memoryStorage();
    save(storage, state({ answers: setAnswer({}, 'gone', 1, 1), stage: 's4' }));

    restore(storage, { version: 'v2', fieldIds: [] });
    const second = restore(storage, { version: 'v2', fieldIds: [] })!;
    expect(second.packChanged).toBe(false);
    expect(second.state.packVersion).toBe('v2');
  });
});

describe('furthestStage', () => {
  it('never decreases', () => {
    expect(furthestStage('s4', 's2')).toBe('s4');
    expect(furthestStage('s2', 's4')).toBe('s4');
    expect(furthestStage('s3', 's3')).toBe('s3');
  });
});
