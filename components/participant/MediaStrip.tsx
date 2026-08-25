/**
 * §4.5 — 0, 1 or 2 images between the prompt and the fields.
 *
 * One image takes the full content width; two sit side by side at half. The
 * cap is enforced at pack validation (`media-cap`), so this renders whatever it
 * is given rather than silently truncating a third.
 *
 * **`aspect` is the whole point of the component.** It is declared in the pack
 * and applied to the frame, so the box reaches its final height on first paint
 * and the fields below never jump when an image lands — or never lands. Images
 * here are decorative-to-supporting: with loading blocked the layout is
 * identical and every question is still answerable.
 */

import type { ContentPack, Media } from '@/lib/pack/types';
import { copyOf } from '@/lib/pack/copy';
import styles from './participant.module.css';

export interface MediaStripProps {
  pack: ContentPack;
  media?: Media[];
}

export function MediaStrip({ pack, media }: MediaStripProps) {
  if (media === undefined || media.length === 0) return null;

  return (
    <div
      className={[styles.media, media.length === 2 ? styles.mediaPair : null]
        .filter(Boolean)
        .join(' ')}
      data-count={media.length}
      data-testid="media"
    >
      {media.map((item) => (
        <div
          key={item.src}
          className={styles.mediaFrame}
          style={{ aspectRatio: String(item.aspect) }}
          data-testid="media-frame"
        >
          {/*
           * A plain <img>, not next/image: `src` is a pack value that may point
           * at any CDN, and next/image would need every such host registered in
           * next.config before a pack could be replaced without a client
           * release (§4.1). The frame above already reserves the space that
           * next/image would otherwise be buying us.
           */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.mediaImage}
            src={item.src}
            alt={copyOf(pack, item.alt)}
            loading="lazy"
            decoding="async"
          />
        </div>
      ))}
    </div>
  );
}
