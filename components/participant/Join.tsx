'use client';

/**
 * The way into a room (§6.2.1): a four-digit code, read aloud or on a QR, that
 * `POST /session` resolves to a room.
 *
 * The participant never sees a roomId and never sends one. That separation is
 * the only thing standing between a participant and the stage flag (§6.2.6),
 * so this screen takes a code and nothing else.
 *
 * An unknown code is a 404 and gets its own line of copy; anything else — the
 * venue wifi dropping, the server restarting — is a retry, not a wrong code,
 * and must not tell forty people their code is bad.
 */

import { useState } from 'react';
import type { ContentPack } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import { ApiError } from '@/lib/session/client';
import styles from './participant.module.css';

export interface JoinProps {
  pack: ContentPack;
  onJoin: (joinCode: string) => Promise<void>;
}

type Status = 'idle' | 'joining' | 'unknown' | 'failed';

export function Join({ pack, onJoin }: JoinProps) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (status === 'joining' || code.length < 4) return;
    setStatus('joining');
    try {
      await onJoin(code);
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 404 ? 'unknown' : 'failed');
    }
  };

  return (
    <main className={`${styles.page} ${styles.centred}`}>
      <form className={styles.body} onSubmit={submit}>
        <h1 className={styles.prompt}>{copyOf(pack, 'join.prompt')}</h1>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="joinCode">
            {copyOf(pack, 'join.label')}
          </label>
          <input
            id="joinCode"
            className={styles.code}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 4));
              setStatus('idle');
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
          />
        </div>
        {status === 'unknown' || status === 'failed' ? (
          <p className={styles.error} role="alert">
            {copyOf(pack, status === 'unknown' ? 'join.error.unknown' : 'join.error.failed')}
          </p>
        ) : null}
        <div className={styles.controls}>
          <button
            type="submit"
            className={styles.primary}
            disabled={code.length < 4 || status === 'joining'}
          >
            {copyOf(pack, 'join.action')}
          </button>
        </div>
      </form>
    </main>
  );
}
