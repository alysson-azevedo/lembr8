/**
 * Tema Mystical Blue (LB-21) — AC 1 (só tokens) e AC 4 (dark-only) como testes
 * de código-fonte: a paleta vive exclusivamente em `src/app/globals.css`.
 * `text-white` no CTA primário é a única classe de cor fora dos tokens,
 * especificada no design (texto branco sobre `--primary`, AA 4,7:1).
 * Manifest/ícones do PWA ficam brancos nesta issue (fora de escopo).
 * Ver docs/product/design/lb-21-tema-mystical-blue.md §2, §6 e §8.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CSS_BRUTO = readFileSync(join(RAIZ, "src/app/globals.css"), "utf8");
/* As regras são o alvo da verificação — comentários explicativos podem
   citar o que a regra NÃO faz (ex.: media query de esquema de cores). */
const CSS = CSS_BRUTO.replace(/\/\*[\s\S]*?\*\//g, "");

const FORA_DO_ESCOPO = new Set(["manifest.ts", "icon.tsx", "apple-icon.tsx"]);

function arquivosFonte(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho));
    else if (/\.(ts|tsx)$/.test(nome) && !FORA_DO_ESCOPO.has(nome))
      saida.push(caminho);
  }
  return saida;
}

describe("Tema LB-21 — tokens no globals.css", () => {
  it("paleta Mystical Blue completa (12 tokens + accent-color + ::selection)", () => {
    const tokens = [
      "--background: #1c1c23",
      "--surface: #25272f",
      "--surface-raised: #2b2e38",
      "--foreground: #e3e3e3",
      "--muted: #9092a2",
      "--primary: #3e6fd9",
      "--primary-hover: #5c8ae6",
      "--selection: #474f71",
      "--success: #27ae60",
      "--danger: #e26875",
      "--warning: #f67400",
      "--overlay: rgb(0 0 0 / 0.4)",
    ];
    for (const token of tokens) expect(CSS).toContain(token);
    expect(CSS).toContain("accent-color: var(--primary)");
    expect(CSS).toContain("::selection");
  });

  it("AC 4: dark-only — sem prefers-color-scheme, com color-scheme: dark", () => {
    expect(CSS).not.toContain("prefers-color-scheme");
    expect(CSS).toContain("color-scheme: dark");
  });

  it("AC 1: nenhuma cor avulsa fora de globals.css (exceto PWA fora do escopo)", () => {
    const proibidos: Array<[RegExp, string]> = [
      [
        /(?:text|bg|border|ring|outline|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
        "classe de paleta Tailwind",
      ],
      [/(?:bg|text|border)-black/, "classe black"],
      [/bg-white/, "bg-white"],
      [/dark:/, "variante dark:"],
      [/#[0-9a-fA-F]{3,8}\b/, "hex literal"],
    ];
    const arquivos = arquivosFonte(join(RAIZ, "src"));
    expect(arquivos.length).toBeGreaterThan(20);
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, "utf8");
      for (const [padrao, rotulo] of proibidos) {
        expect(conteudo, `${arquivo} contém ${rotulo}`).not.toMatch(padrao);
      }
    }
  });
});
