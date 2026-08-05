/**
 * Identificação do build exibida na página de status — permite ao QA saber
 * em qual deploy está. Populado pela Vercel; fora dela usa os fallbacks.
 */
export type BuildInfo = {
  environment: string;
  commit: string;
};

export function getBuildInfo(
  env: Record<string, string | undefined> = process.env,
): BuildInfo {
  return {
    environment: env.VERCEL_ENV || "development",
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
  };
}
