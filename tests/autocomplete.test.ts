import { describe, expect, it } from "vitest";
import {
  normalizaTexto,
  sugestoesPara,
  textoCombina,
} from "@/lib/todos/repository";

/**
 * Funções puras do autocomplete (LB-13; LB-25 contains): normalização,
 * casamento contains insensível a acento/caixa (qualquer posição), dedup mais
 * recente, limite 6 e ordenação prefixo > mid-word, depois `updatedAt` desc.
 * Node puro (sem DOM/storage). Cobre ACs 1-8 da spec LB-25.
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

describe("textoCombina (LB-25 — contains, em qualquer posição)", () => {
  it("insensível a acento/caixa", () => {
    expect(textoCombina("cafe", "Café")).toBe(true);
    expect(textoCombina("ARROZ", "Arroz")).toBe(true);
  });
  it("casa prefixo de texto composto (sem regressão LB-13)", () => {
    expect(textoCombina("ar", "Arroz integral")).toBe(true);
  });
  it("casa mid-word — contains (LB-25; era fora de escopo na LB-13)", () => {
    expect(textoCombina("rr", "Arroz")).toBe(true);
    expect(textoCombina("rroz", "Arroz")).toBe(true);
  });
  it("casa qualquer palavra e substring parcial (sem tokenização)", () => {
    expect(textoCombina("laminado", "Papel Laminado")).toBe(true);
    expect(textoCombina("aminado", "Papel Laminado")).toBe(true);
  });
  it("não casa quando o texto não contém a query", () => {
    expect(textoCombina("xyz", "Arroz")).toBe(false);
  });
  it("query vazia → false (não casa nada)", () => {
    expect(textoCombina("", "Arroz")).toBe(false);
    expect(textoCombina("   ", "Arroz")).toBe(false);
  });
});

describe("sugestoesPara (LB-13; LB-25 contains)", () => {
  it("AC 2 — acento/caixa: query 'cafe' → ['Café']; 'ARROZ' → ['Arroz']", () => {
    const items: Rec[] = [rec("Café", "2026-01-01"), rec("Arroz", "2026-01-02")];
    expect(sugestoesPara(items, "cafe", 6)).toEqual(["Café"]);
    expect(sugestoesPara(items, "ARROZ", 6)).toEqual(["Arroz"]);
  });

  it("AC 1 — contains: palavra não-inicial encontra o item", () => {
    const items: Rec[] = [rec("Papel Laminado", "2026-01-01")];
    expect(sugestoesPara(items, "laminado", 6)).toEqual(["Papel Laminado"]);
  });

  it("AC 2 — substring parcial também casa (sem tokenização por palavra)", () => {
    const items: Rec[] = [rec("Papel Laminado", "2026-01-01")];
    expect(sugestoesPara(items, "aminado", 6)).toEqual(["Papel Laminado"]);
  });

  it("AC 3 — acento + contains juntos (teste explícito)", () => {
    const items: Rec[] = [
      rec("Ação", "2026-01-01"),
      rec("Café", "2026-01-02"),
      rec("Papel Laminado", "2026-01-03"),
    ];
    // mid-word com acento no texto: "acao" contém "cao"
    expect(sugestoesPara(items, "cao", 6)).toEqual(["Ação"]);
    expect(sugestoesPara(items, "acao", 6)).toEqual(["Ação"]);
    expect(sugestoesPara(items, "cafe", 6)).toEqual(["Café"]);
    // multi-palavra contígua, ambos os lados normalizados
    expect(sugestoesPara(items, "papel laminado", 6)).toEqual(["Papel Laminado"]);
  });

  it("AC 5 — ordenação: prefixo antes de mid-word", () => {
    const items: Rec[] = [
      rec("Lâmpada", "2026-01-01"), // prefixo ("lampada" começa com "lam")
      rec("Papel Laminado", "2026-03-01"), // mid-word (contém "lam")
    ];
    // prefixo mais antigo precede mid-word mais recente
    expect(sugestoesPara(items, "lam", 6)).toEqual([
      "Lâmpada",
      "Papel Laminado",
    ]);
  });

  it("AC 6 — limite aplicado após a ordenação: prefixos não são cortados por mid-words recentes", () => {
    const items: Rec[] = [
      rec("Arroz", "2026-01-01"), // prefixo "a"
      rec("Aveia", "2026-02-01"), // prefixo "a"
      rec("Açaí", "2026-03-01"), // prefixo "a"
      rec("Banana", "2026-04-01"), // mid-word ("banana" contém "a")
      rec("Berinjela", "2026-05-01"), // mid-word
      rec("Batata", "2026-06-01"), // mid-word
      rec("Goiaba", "2026-07-01"), // mid-word
      rec("Broa", "2026-08-01"), // mid-word ("broa" contém "a")
    ];
    const res = sugestoesPara(items, "a", 6);
    expect(res).toEqual([
      "Açaí", // prefixos por updatedAt desc
      "Aveia",
      "Arroz",
      "Broa", // mid-words mais recentes completam o limite
      "Goiaba",
      "Batata",
    ]);
  });

  it("contains: 'rroz' agora casa 'Arroz' (era fora de escopo na LB-13)", () => {
    const items: Rec[] = [rec("Arroz", "2026-01-01")];
    expect(sugestoesPara(items, "rroz", 6)).toEqual(["Arroz"]);
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
