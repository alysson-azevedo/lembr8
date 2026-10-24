// LB-27 — manifest instalável: ícones com tamanho real declarado (critério
// do Chromium: ≥144px) e cores JuxTheme. Ver docs/product/lb-27-*.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../src/app/manifest";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Dimensões reais do PNG, lidas do header IHDR (sem deps de imagem). */
function pngSize(publicPath: string): { width: number; height: number } {
  const buf = readFileSync(join(process.cwd(), "public", publicPath));
  expect(buf.subarray(0, 8).equals(PNG_MAGIC), `${publicPath} não é PNG`).toBe(
    true,
  );
  expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("LB-27 — manifest instalável", () => {
  const m = manifest();
  const icons = [...(m.icons ?? [])];

  it("declara ícones 192/512/maskable com sizes reais e propósito", () => {
    expect(icons).toContainEqual({
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    });
    expect(icons).toContainEqual({
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    });
    expect(icons).toContainEqual({
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });
  });

  it("não declara o favicon 32px do file convention (/icon)", () => {
    expect(icons.some((i) => i.src === "/icon")).toBe(false);
  });

  it("todo ícone declarado existe em public/ com as dimensões do sizes", () => {
    for (const icon of icons) {
      const [w, h] = (icon.sizes ?? "").split("x").map(Number);
      expect(w, `${icon.src} sizes`).toBeGreaterThanOrEqual(144); // installability
      const real = pngSize(icon.src.replace(/^\//, ""));
      expect(real).toEqual({ width: w, height: h });
    }
  });

  it("theme_color e background_color = JuxTheme #1c1c23 (LB-21)", () => {
    expect(m.theme_color).toBe("#1c1c23");
    expect(m.background_color).toBe("#1c1c23");
  });

  it("mantém standalone e start_url /", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
  });
});
