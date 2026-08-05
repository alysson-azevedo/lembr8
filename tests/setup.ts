import { execFileSync } from "node:child_process";

/**
 * Os testes rodam contra o Supabase local em Docker (`pnpm db:start`).
 * As chaves do stack local são fixas, mas não ficam versionadas: são lidas do
 * próprio CLI para não disparar o secret scanning do GitHub.
 */
type Status = {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

function localStatus(): Status {
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(out) as Status;
  } catch {
    throw new Error(
      "Supabase local indisponível. Rode `pnpm db:start` antes dos testes.",
    );
  }
}

if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  !process.env.SUPABASE_SECRET_KEY
) {
  const status = localStatus();
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
}
