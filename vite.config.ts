// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Host-agnostic Supabase configuration.
 *
 * Works on any host (Vercel, Lovable, self-hosted): the values are read from the
 * build environment, accepting either the VITE_-prefixed or the plain names, so a
 * deployment that only defines SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY still ships a
 * working browser bundle, and a deployment that only defines the VITE_ names still
 * has server-side values available.
 *
 * Only public (publishable) values are inlined. Secrets such as
 * SUPABASE_SERVICE_ROLE_KEY are never defined here and stay runtime-only.
 */
const env = process.env;

const publicConfig = {
  URL: env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'],
  PUBLISHABLE_KEY: env['VITE_SUPABASE_PUBLISHABLE_KEY'] || env['SUPABASE_PUBLISHABLE_KEY'],
  PROJECT_ID: env['VITE_SUPABASE_PROJECT_ID'] || env['SUPABASE_PROJECT_ID'],
} as const;

const define: Record<string, string> = {};
for (const [suffix, value] of Object.entries(publicConfig)) {
  if (!value) continue;
  const literal = JSON.stringify(value);
  define[`import.meta.env.VITE_SUPABASE_${suffix}`] = literal;
  // Server (Nitro) code reads the plain names; inline them so the app does not
  // depend on the host forwarding build-time env vars to the runtime.
  define[`process.env.SUPABASE_${suffix}`] = literal;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define,
  },
});
