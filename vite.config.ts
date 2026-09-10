// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Host-agnostic Supabase configuration (Vercel, Lovable, self-hosted, ...).
 *
 * Accept either the VITE_-prefixed or the plain names at build time and mirror them,
 * so a deployment that only defines SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY still ships
 * a working browser bundle. Vite picks up VITE_* values from process.env at config time.
 *
 * Only public (publishable) values are mirrored. Secrets such as
 * SUPABASE_SERVICE_ROLE_KEY are never inlined and stay runtime-only.
 */
for (const suffix of ["URL", "PUBLISHABLE_KEY", "PROJECT_ID"] as const) {
  const plain = `SUPABASE_${suffix}`;
  const prefixed = `VITE_SUPABASE_${suffix}`;
  const value = process.env[prefixed] || process.env[plain];
  if (!value) continue;
  process.env[prefixed] = value;
  process.env[plain] = value;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
