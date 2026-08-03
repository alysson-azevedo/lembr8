import { describe, expect, it } from "vitest";
import { getBuildInfo } from "@/lib/build-info";

describe("getBuildInfo", () => {
  it("usa os fallbacks fora da Vercel", () => {
    expect(getBuildInfo({})).toEqual({
      environment: "development",
      commit: "local",
    });
  });

  it("encurta o SHA do commit para 7 caracteres", () => {
    expect(
      getBuildInfo({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: "0123456789abcdef",
      }),
    ).toEqual({ environment: "preview", commit: "0123456" });
  });
});
