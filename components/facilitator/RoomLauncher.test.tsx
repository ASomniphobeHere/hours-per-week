// @vitest-environment jsdom

/**
 * The landing screen (step 8.7) — the button, its failure, and the list this
 * browser keeps.
 *
 * `fetchImpl` and `navigate` are both injected, the way `Console` takes its
 * `fetchImpl`: what is under test is the screen, and a router mock would only
 * assert that Next works. Storage is jsdom's own `localStorage`, seeded per
 * test, because the module reads the real one through `useSyncExternalStore`
 * and a fake passed by prop would prove a path the browser never takes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { RoomLauncher } from './RoomLauncher';
import { rememberedRooms, ROOMS_KEY, type RememberedRoom } from '@/lib/console/rooms';
import type { FetchLike } from '@/lib/api/client';

function room(joinCode: string, createdAt: number): RememberedRoom {
  return { roomId: `room-${joinCode}`, joinCode, createdAt };
}

function seed(rooms: RememberedRoom[]): void {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
}

/** One room per POST, with codes handed out in order. */
function stubServer(codes: string[] = ['4712']) {
  const server = { created: 0, fails: false };
  const fetchImpl: FetchLike = async () => {
    if (server.fails) return Response.json({ error: 'nope' }, { status: 500 });
    const joinCode = codes[server.created] ?? '9999';
    server.created += 1;
    return Response.json(
      { roomId: `room-${joinCode}`, joinCode, consoleUrl: `/facilitate/room-${joinCode}` },
      { status: 201 },
    );
  };
  return { server, fetchImpl };
}

function settle(): Promise<void> {
  return act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

const newRoom = () => screen.getByTestId('new-room');

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('creating a room', () => {
  it('creates one and lands on its console (AC 49a)', async () => {
    const { server, fetchImpl } = stubServer();
    const navigate = vi.fn();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={navigate} />);

    await act(async () => newRoom().click());
    await settle();

    expect(server.created).toBe(1);
    // `consoleUrl` as returned — the server owns the shape of that path.
    expect(navigate).toHaveBeenCalledWith('/facilitate/room-4712');
  });

  it('remembers the room it just created (AC 49a)', async () => {
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);

    await act(async () => newRoom().click());
    await settle();

    const remembered = rememberedRooms();
    expect(remembered).toHaveLength(1);
    expect(remembered[0]).toMatchObject({ roomId: 'room-4712', joinCode: '4712' });
  });

  it('mints one room under a double-press', async () => {
    /*
     * The one failure this screen could introduce: two rooms means a
     * facilitator reading one code aloud while the console shows the other.
     */
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      await held;
      return Response.json(
        { roomId: 'room-4712', joinCode: '4712', consoleUrl: '/facilitate/room-4712' },
        { status: 201 },
      );
    };

    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);

    await act(async () => newRoom().click());
    expect(newRoom()).toBeDisabled();
    await act(async () => newRoom().click());

    await act(async () => {
      release?.();
      await held;
    });
    await settle();

    expect(calls).toBe(1);
  });

  it('shows an inline error and re-enables when the request fails', async () => {
    const { server, fetchImpl } = stubServer();
    server.fails = true;
    const navigate = vi.fn();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={navigate} />);

    await act(async () => newRoom().click());
    await settle();

    expect(screen.getByTestId('new-room-error')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(rememberedRooms()).toEqual([]);
    expect(newRoom()).toBeEnabled();

    server.fails = false;
    await act(async () => newRoom().click());
    await settle();
    expect(navigate).toHaveBeenCalledWith('/facilitate/room-4712');
  });
});

describe('the remembered list', () => {
  it('is absent entirely when there is nothing to list', async () => {
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();

    // No empty-state copy — the rule §7.7 already sets for Not included.
    expect(screen.queryByTestId('remembered-rooms')).not.toBeInTheDocument();
  });

  it('lists remembered rooms newest first, each linking to its console', async () => {
    seed([room('1111', 1_000), room('3333', 3_000), room('2222', 2_000)]);
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();

    const rows = within(screen.getByTestId('remembered-rooms')).getAllByRole('link');
    expect(rows.map((row) => row.textContent?.slice(0, 4))).toEqual(['3333', '2222', '1111']);
    expect(rows[0]).toHaveAttribute('href', '/facilitate/room-3333');
  });

  it('grows by the room just created, without a reload', async () => {
    seed([room('1111', 1_000)]);
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();
    expect(screen.getByTestId('remembered-1111')).toBeInTheDocument();

    await act(async () => newRoom().click());
    await settle();

    expect(screen.getByTestId('remembered-4712')).toBeInTheDocument();
    expect(screen.getByTestId('remembered-1111')).toBeInTheDocument();
  });

  it('forgets one room and leaves the others', async () => {
    seed([room('1111', 1_000), room('2222', 2_000)]);
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();

    await act(async () => screen.getByTestId('forget-1111').click());
    await settle();

    expect(screen.queryByTestId('remembered-1111')).not.toBeInTheDocument();
    expect(screen.getByTestId('remembered-2222')).toBeInTheDocument();
    expect(rememberedRooms().map((r) => r.joinCode)).toEqual(['2222']);
  });

  it('forgetting the last room takes the whole section with it', async () => {
    seed([room('1111', 1_000)]);
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();

    await act(async () => screen.getByTestId('forget-1111').click());
    await settle();

    expect(screen.queryByTestId('remembered-rooms')).not.toBeInTheDocument();
  });

  it('renders nothing rather than throwing on a stale or hand-edited key', async () => {
    localStorage.setItem(ROOMS_KEY, '{"not":"a list"}');
    const { fetchImpl } = stubServer();
    render(<RoomLauncher fetchImpl={fetchImpl} navigate={vi.fn()} />);
    await settle();

    expect(screen.getByTestId('launcher')).toBeInTheDocument();
    expect(screen.queryByTestId('remembered-rooms')).not.toBeInTheDocument();
  });
});
