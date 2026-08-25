// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentPack, Media } from '@/lib/pack/types';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { assertValidPack } from '@/lib/pack/loader';
import { Questionnaire } from './Questionnaire';
import { renderParticipant } from './__fixtures__/harness';

const ONE: Media[] = [{ src: 'https://cdn.example/a.png', alt: 'media.a', aspect: 1.5 }];

const TWO: Media[] = [
  ...ONE,
  { src: 'https://cdn.example/b.png', alt: 'media.b', aspect: 0.75 },
];

/** The fixture pack with media hung on its first screen. */
function packWithMedia(media: Media[]): ContentPack {
  const pack = minimalPack();
  pack.screens[0]!.media = media;
  pack.copy['media.a'] = 'A clock face';
  pack.copy['media.b'] = 'A calendar page';
  return pack;
}

describe('§4.5 media', () => {
  it('reserves layout space from the declared aspect, before any load (AC 3)', () => {
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { pack: packWithMedia(TWO) });

    const frames = screen.getAllByTestId('media-frame');
    expect(frames).toHaveLength(2);
    // The box has its final height on first paint, so the fields below it
    // cannot jump when an image lands — or never lands.
    expect(frames[0]).toHaveStyle({ aspectRatio: '1.5' });
    expect(frames[1]).toHaveStyle({ aspectRatio: '0.75' });
  });

  it('lays one image full width and two side by side (§4.5)', () => {
    const single = renderParticipant(<Questionnaire onComplete={vi.fn()} />, {
      pack: packWithMedia(ONE),
    });
    const oneUp = screen.getByTestId('media');
    expect(within(oneUp).getAllByRole('img')).toHaveLength(1);
    expect(oneUp).toHaveAttribute('data-count', '1');
    const oneUpClasses = oneUp.className.split(' ');
    single.unmount();

    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { pack: packWithMedia(TWO) });
    const twoUp = screen.getByTestId('media');
    expect(twoUp).toHaveAttribute('data-count', '2');

    // The pair takes a second class — the half-width columns — that the single
    // case does not. jsdom applies no stylesheet, so the class is the assertion.
    const twoUpClasses = twoUp.className.split(' ');
    expect(twoUpClasses).toHaveLength(oneUpClasses.length + 1);
    expect(twoUpClasses).toEqual(expect.arrayContaining(oneUpClasses));
  });

  it('renders no strip at all when a screen declares none', () => {
    renderParticipant(<Questionnaire onComplete={vi.fn()} />);
    expect(screen.queryByTestId('media')).not.toBeInTheDocument();
  });

  it('resolves alt text through the pack (§4.5, §9)', () => {
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, { pack: packWithMedia(TWO) });
    expect(screen.getByAltText('A clock face')).toBeInTheDocument();
    expect(screen.getByAltText('A calendar page')).toBeInTheDocument();
  });

  it('leaves every question answerable with images blocked (AC 4)', async () => {
    const user = userEvent.setup();
    const { storage } = renderParticipant(<Questionnaire onComplete={vi.fn()} />, {
      pack: packWithMedia(TWO),
    });

    // Both images fail, as they would with loading blocked.
    for (const image of screen.getAllByRole('img')) fireEvent.error(image);

    const workday = within(screen.getByRole('group', { name: 'On a workday' }));
    await user.click(workday.getByLabelText('Increase'));

    expect(workday.getByRole('status')).toHaveTextContent('61');
    expect(screen.getAllByTestId('media-frame')).toHaveLength(2);
    expect(JSON.parse(storage.getItem('hpw:state:sess-test') ?? '{}').answers[
      'alpha.minutes.wd'
    ].value).toBe(61);
  });

  it('is capped at two by pack validation, not by the renderer (§4.5)', () => {
    const three = packWithMedia([
      ...TWO,
      { src: 'https://cdn.example/c.png', alt: 'media.a', aspect: 1 },
    ]);
    expect(() => assertValidPack(three)).toThrow(/media-cap/);
  });
});
