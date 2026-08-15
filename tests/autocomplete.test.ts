import { describe, expect, it } from "vitest";
import {
  normalizaTexto,
  prefixoCombina,
  sugestoesPara,
} from "@/lib/todos/repository";

/**
 * Funções puras do autocomplete (LB-13): normalização, casamento por prefixo
 * insensível a acento/caixa, dedup mais recente, limite 6 e ordenação por
 * `updatedAt` desc. Node puro (sem DOM/storage). Cobre AC 2, 3, 6.
 */
type Rec = { texto: string; updatedAt: string };

function rec(texto: string, updatedAt: string): Rec {
  return { texto, updatedAt };
}

describe("normalizaTexto (LB-13 AC 2)", () => {
  it("remove acentos e caixa", () => {
    expect(normalizaTexto("Café")).toBe("cafe");
    expect(normalizaTexto("ARROZ")).toBe("arroz");
    expect(normalizaTexto("  Arroz ")).toBe("arroz");
  });
  it("string vazia/ só espaços → ''", () => {
    expect(normalizaTexto("")).toBe("");
    expect(normalizaTexto("   ")).toBe("");
  });
});

describe("prefixoCombina (LB-13 — só prefixo, não contém)", () => {
  it("insensível a acento/caixa", () => {
    expect(prefixoCombina("cafe", "Café")).toBe(true);
    expect(prefixoCombina("ARROZ", "Arroz")).toBe(true);
  });
  it("casa prefixo de texto composto", () => {
    expect(prefixoCombina("ar", "Arroz integral")).toBe(true);
  });
  it("não casa 'contém' (mid-word) — fora de escopo", () => {
    expect(prefixoCombina("rr", "Arroz")).toBe(false);
    expect(prefixoCombina("rroz", "Arroz")).toBe(false);
  });
  it("prefixo vazio → false (não casa nada)", () => {
    expect(prefixoCombina("", "Arroz")).toBe(false);
    expect(prefixoCombina("   ", "Arroz")).toBe(false);
  });
});

describe("sugestoesPara (LB-13)", () => {
  it("AC 2 — acento/caixa: query 'cafe' → ['Café']; 'ARROZ' → ['Arroz']", () => {
    const items: Rec[] = [rec("Café", "2026-01-01"), rec("Arroz", "2026-01-02")];
    expect(sugestoesPara(items, "cafe", 6)).toEqual(["Café"]);
    expect(sugestoesPara(items, "ARROZ", 6)).toEqual(["Arroz"]);
  });

  it("AC 3 — todas as listas: não filtra por listId (recebe só {texto, updatedAt})", () => {
    // Mesmo texto em listas diferentes (simulado sem listId) → uma sugestão.
    const items: Rec[] = [
      rec("Leite", "2026-01-01"),
      rec("Leite", "2026-02-01"),
    ];
    expect(sugestoesPara(items, "lei", 6)).toEqual(["Leite"]);
  });

  it("AC 6 — dedup mantém o de maior updatedAt (mostra o texto da ocorrência mais recente)", () => {
    const items: Rec[] = [
      rec("Arroz", "2026-01-01"),
      rec("arroz", "2026-02-01"),
    ];
    // ocorrência mais recente é "arroz" (2026-02-01) — preserva o texto dela.
    expect(sugestoesPara(items, "ar", 6)).toEqual(["arroz"]);
  });

  it("AC 6 — limite 6: com 8 candidatos de prefixo 'a', só 6 aparecem", () => {
    const items: Rec[] = Array.from({ length: 8 }, (_, i) =>
      rec(`a${i}`, `2026-01-0${i + 1}`),
    );
    const res = sugestoesPara(items, "a", 6);
    expect(res).toHaveLength(6);
  });

  it("AC 6 — ordenação updatedAt desc: o primeiro é o de maior updatedAt", () => {
    const items: Rec[] = [
      rec("Arroz", "2026-01-01"),
      rec("Aveia", "2026-03-01"),
      rec("Açaí", "2026-02-01"),
    ];
    const res = sugestoesPara(items, "a", 6);
    expect(res[0]).toBe("Aveia"); // 2026-03-01, o mais recente
    // todos casam prefixo "a" insensível a acento (Açaí → "acai" começa com "a")
    expect(res).toHaveLength(3);
  });

  it("query vazia → [] (sugestões só a partir do primeiro caractere)", () => {
    const items: Rec[] = [rec("Arroz", "2026-01-01")];
    expect(sugestoesPara(items, "", 6)).toEqual([]);
    expect(sugestoesPara(items, "   ", 6)).toEqual([]);
  });

  it("não casa 'contém' (fora de escopo): 'rroz' não casa 'Arroz'", () => {
    const items: Rec[] = [rec("Arroz", "2026-01-01")];
    expect(sugestoesPara(items, "rroz", 6)).toEqual([]);
  });

  it("não muta a entrada", () => {
    const items: Rec[] = [rec("Arroz", "2026-01-01"), rec("Café", "2026-02-01")];
    const snapshot = items.map((i) => ({ ...i }));
    sugestoesPara(items, "a", 6);
    expect(items).toEqual(snapshot);
  });

  it("empate de updatedAt: estável, preserva ordem de primeiro aparecimento", () => {
    const items: Rec[] = [
      rec("Arroz", "2026-01-01"),
      rec("Aveia", "2026-01-01"),
    ];
    const res = sugestoesPara(items, "a", 6);
    // ambos empatam em updatedAt → sort estável mantém "Arroz" antes de "Aveia"
    expect(res).toEqual(["Arroz", "Aveia"]);
  });
});