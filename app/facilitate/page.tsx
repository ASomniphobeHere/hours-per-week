/**
 * `/facilitate` — the console's landing screen (step 8.7).
 *
 * A static segment beside the dynamic `[roomId]` one, and it wins over it: the
 * literal path is matched before the parameter. There is no auth in v1
 * (§6.2.6), and this route creates rooms rather than reading them, so it
 * exposes nothing the flip endpoint does not already.
 */

import { RoomLauncher } from '@/components/facilitator/RoomLauncher';

export const dynamic = 'force-dynamic';

export default function FacilitateHome() {
  return <RoomLauncher />;
}
