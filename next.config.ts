import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundler.
  serverExternalPackages: ['better-sqlite3'],
  /*
   * `next dev` blocks cross-origin requests to its own dev assets, and it
   * treats `127.0.0.1` as a different origin from the `localhost` it binds.
   * Playwright drives the app at `127.0.0.1` (playwright.config.ts), so
   * without this the dev-only chunks 403 and the client never hydrates.
   * Development only — it has no effect on `next start`, and the LAN origins
   * a rehearsal needs are Stage 12's to add.
   */
  allowedDevOrigins: ['127.0.0.1',
    '172.29.228.70'
  ],
};

export default nextConfig;
