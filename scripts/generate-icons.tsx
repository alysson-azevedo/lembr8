/**
 * Regenera os ícones estáticos do PWA (LB-27) em `public/icons/`.
 *
 *   pnpm exec tsx scripts/generate-icons.ts
 *
 * Arte = 💭 (a mesma de `src/app/icon.tsx`), via `ImageResponse` do `next/og`.
 * Os PNGs são **commitados** — rodar apenas quando a arte ou o tema mudar.
 * Ver `docs/product/design/lb-27-pwa-instalavel-android.md` (safe zone do
 * maskable: conteúdo em 55%, meia-diagonal ~38,9% ≤ raio de 40%).
 */
import { ImageResponse } from "next/og";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BG = "#1c1c23"; // JuxTheme (LB-21) — fundo do maskable/splash
const OUT_DIR = fileURLToPath(new URL("../public/icons", import.meta.url));

function emojiIcon(size: number, scale: number, background: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background,
          fontSize: `${Math.round(size * scale)}px`,
        }}
      >
        💭
      </div>
    ),
    { width: size, height: size },
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const targets = [
    { name: "icon-192.png", size: 192, scale: 0.8, background: "transparent" },
    { name: "icon-512.png", size: 512, scale: 0.8, background: "transparent" },
    { name: "icon-maskable-512.png", size: 512, scale: 0.55, background: BG },
  ];
  for (const t of targets) {
    const res = await emojiIcon(t.size, t.scale, t.background);
    const png = Buffer.from(await res.arrayBuffer());
    await writeFile(`${OUT_DIR}/${t.name}`, png);
    console.log(`ok ${t.name} (${t.size}x${t.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
