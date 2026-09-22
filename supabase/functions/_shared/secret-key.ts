/** The project's secret key: the new kind when present, else the legacy one. */
export function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const key = (JSON.parse(keys) as Record<string, string>).default;
    if (key) return key;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('no secret key in the environment');
  return legacy;
}
