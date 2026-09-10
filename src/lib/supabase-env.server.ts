/**
 * Host-agnostic server-side Supabase environment bootstrap.
 *
 * Server code (Nitro/SSR, server functions, middleware) reads the plain names
 * `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PROJECT_ID` from
 * `process.env`. Different hosts expose configuration differently:
 *
 *  - Vercel / Node: values live in `process.env` at runtime.
 *  - Vite build: public values are inlined into `import.meta.env.VITE_*`.
 *  - Workers-style runtimes: values arrive on the request `env` binding.
 *
 * This module reconciles all three so the app never depends on one specific host.
 * Only public/publishable values are mirrored here — secrets such as
 * SUPABASE_SERVICE_ROLE_KEY are read straight from the runtime environment.
 */

const PUBLIC_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
] as const;

function processEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env) return proc.env;
  const env: Record<string, string | undefined> = {};
  (globalThis as { process?: unknown }).process = { env };
  return env;
}

/** Fill missing plain names from Vite-inlined public values. */
export function hydrateSupabaseEnvFromBuild(): void {
  const env = processEnv();
  const viteEnv = import.meta.env as unknown as Record<string, string | undefined>;
  for (const key of PUBLIC_KEYS) {
    if (env[key]) continue;
    const value = viteEnv[`VITE_${key}`];
    if (value) env[key] = value;
  }
}

/** Fill missing values from a Workers-style request env binding. */
export function hydrateSupabaseEnvFromBinding(binding: unknown): void {
  if (!binding || typeof binding !== "object") return;
  const source = binding as Record<string, unknown>;
  const env = processEnv();
  for (const key of [...PUBLIC_KEYS, "SUPABASE_SERVICE_ROLE_KEY", "LOVABLE_API_KEY"]) {
    if (env[key]) continue;
    const value = source[key] ?? source[`VITE_${key}`];
    if (typeof value === "string" && value) env[key] = value;
  }
}

/** Names of required public Supabase settings that are still missing. */
export function missingSupabasePublicEnv(): string[] {
  const env = processEnv();
  return ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"].filter((key) => !env[key]);
}

hydrateSupabaseEnvFromBuild();
