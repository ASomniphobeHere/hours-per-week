/**
 * `/facilitate/:roomId` — §6.2.1's console route.
 *
 * The roomId comes off the URL and goes no further: it is the console's alone
 * (§6.2.1, **RD-2**), and the participant client has no route that takes one.
 * There is no auth in v1 (§6.2.6) — a scope decision, and the reason the id
 * must never be sent to a participant.
 */

import { Console } from '@/components/facilitator/Console';

export const dynamic = 'force-dynamic';

export default async function FacilitatePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <Console roomId={roomId} />;
}
