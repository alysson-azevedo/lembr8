// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));

let fakeUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
  }),
}));

import { ListasIndex } from "@/components/listas/ListasIndex";
import { ListaScreen } from "@/components/listas/ListaScreen";
import { __resetListasStoreForTests } from "@/lib/todos/store";

beforeEach(() => {
  window.localStorage.clear();
  __resetListasStoreForTests();
  pushMock.mockClear();
  fakeUser = { id: "user-1" };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

/** Cria N listas via índice (Nova lista) e devolve os ids na ordem de criação. */
function newListaIds(qtd: number): string[] {
  render(<ListasIndex />);
  const ids: string[] = [];
  for (let i = 0; i < qtd; i++) {
    fireEvent.click(screen.getByText("Nova lista"));
    const path = pushMock.mock.calls[i][0] as string;
    ids.push(path.replace("/listas/", ""));
  }
  cleanup();
  return ids;
}

/** Renomeia uma lista pelo detalhe (clica no título, digita, Enter). */
function renomearLista(id: string, nome: string) {
  render(<ListaScreen listId={id} />);
  fireEvent.click(screen.getByText(/Lista \d/));
  const input = screen.getByLabelText("Nome da lista");
  fireEvent.change(input, { target: { value: nome } });
  fireEvent.keyDown(input, { key: "Enter" });
  cleanup();
}

describe("ListasIndex — filtro por nome (LB-17 PR1, AC 1)", () => {
  it("campo de filtro aparece apenas quando há listas", async () => {
    render(<ListasIndex />);
    expect(
      await screen.findByText(/Nenhuma lista ainda/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Filtrar listas por nome")).toBeNull();
    cleanup();

    // cria uma lista e re-renderiza
    const ids = newListaIds(1);
    expect(ids).toHaveLength(1);
    render(<ListasIndex />);
    expect(
      await screen.findByLabelText("Filtrar listas por nome"),
    ).toBeInTheDocument();
  });

  it("campo de filtro é type=search com placeholder correto", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    const input = await screen.findByLabelText("Filtrar listas por nome");
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("placeholder", "Filtrar por nome");
  });

  it("digitar parte do nome mostra apenas as listas que casam (substring)", async () => {
    const [id1, id2] = newListaIds(2);
    renomearLista(id1, "Mercado");
    renomearLista(id2, "Farmácia");

    render(<ListasIndex />);
    await screen.findByText("Mercado");
    expect(screen.getByText("Farmácia")).toBeInTheDocument();

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "mer" } });

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Farmácia")).toBeNull();
  });

  it("match case-insensitive (AC 1)", async () => {
    const [id1, id2] = newListaIds(2);
    renomearLista(id1, "Mercado");
    renomearLista(id2, "Farmácia");

    render(<ListasIndex />);
    await screen.findByText("Mercado");

    const input = screen.getByLabelText("Filtrar listas por nome");
    // uppercase no filtro casa lowercase no nome
    fireEvent.change(input, { target: { value: "MER" } });
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Farmácia")).toBeNull();

    // mistura de caso
    fireEvent.change(input, { target: { value: "mErCa" } });
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Farmácia")).toBeNull();
  });

  it("filtro vazio mostra todas as listas (sem filtro ativo)", async () => {
    const [id1, id2] = newListaIds(2);
    renomearLista(id1, "Mercado");
    renomearLista(id2, "Farmácia");

    render(<ListasIndex />);
    await screen.findByText("Mercado");

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(screen.queryByText("Mercado")).toBeNull();
    expect(screen.queryByText("Farmácia")).toBeNull();

    // limpa o filtro → todas voltam
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Farmácia")).toBeInTheDocument();
  });

  it("espaços nas pontas do filtro são ignorados (trim)", async () => {
    const [id1] = newListaIds(1);
    renomearLista(id1, "Mercado");

    render(<ListasIndex />);
    await screen.findByText("Mercado");

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "  mer  " } });
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("filtro sem resultados mostra mensagem de vazio do filtro", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "zzz-sem-match" } });

    expect(
      await screen.findByText(/Nenhuma lista encontrada com esse nome/),
    ).toBeInTheDocument();
    // mensagem de índice vazio (distinta) NÃO aparece
    expect(screen.queryByText(/Nenhuma lista ainda/)).toBeNull();
  });

  it("mensagem de vazio do filtro só aparece quando há listas mas nenhuma casa", async () => {
    render(<ListasIndex />);
    await screen.findByText(/Nenhuma lista ainda/);
    // índice vazio: nem o campo, nem a mensagem de filtro vazia
    expect(screen.queryByLabelText("Filtrar listas por nome")).toBeNull();
    expect(
      screen.queryByText(/Nenhuma lista encontrada/),
    ).toBeNull();
  });

  it("filtro não persiste após desmontar/remontar (efêmero)", async () => {
    const [id1] = newListaIds(1);
    renomearLista(id1, "Mercado");

    const { unmount } = render(<ListasIndex />);
    await screen.findByText("Mercado");
    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "mer" } });
    expect(screen.getByText("Mercado")).toBeInTheDocument();

    unmount();
    render(<ListasIndex />);
    // ao reabrir, o campo volta vazio — todas as listas visíveis
    await screen.findByText("Mercado");
    const inputPos = screen.getByLabelText(
      "Filtrar listas por nome",
    ) as HTMLInputElement;
    expect(inputPos.value).toBe("");
  });

  /** Nomes das listas na ordem em que aparecem (sem o pin). */
  function nomesEmOrdem(): string[] {
    return screen
      .getAllByRole("link")
      .map((a) => {
        const outer = a.querySelector("span");
        if (!outer) return "";
        const pin = outer.querySelector("span[aria-label]");
        if (pin) pin.remove();
        return outer.textContent?.trim() ?? "";
      })
      .filter((n) => n.startsWith("Mercado") || n.startsWith("Farmácia"));
  }

  it("filtro preserva a ordenação LB-14 (Fixadas→Demais por updated_at desc)", async () => {
    const [id1, id2] = newListaIds(2);
    renomearLista(id1, "Mercado");
    renomearLista(id2, "Farmácia");
    // fixa Mercado (vai para o topo, seção Fixadas)
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();

    render(<ListasIndex />);
    await screen.findByText("Mercado");
    // ordem inicial: Mercado (fixada) → Farmácia
    expect(nomesEmOrdem()).toEqual(["Mercado", "Farmácia"]);

    // filtra por "a" — ambas casam; ordem preservada
    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "a" } });
    expect(nomesEmOrdem()).toEqual(["Mercado", "Farmácia"]);
  });

  it("filtrar não remove o indicador de pin (LB-14)", async () => {
    const [id1] = newListaIds(1);
    renomearLista(id1, "Mercado");
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();

    render(<ListasIndex />);
    await screen.findByText("Mercado");
    expect(screen.getByLabelText('Fixada: "Mercado"')).toBeInTheDocument();

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "mer" } });
    // pin permanece visível na linha filtrada
    expect(screen.getByLabelText('Fixada: "Mercado"')).toBeInTheDocument();
  });

  it("botão 'Nova lista' permanece funcional e visível com filtro ativo", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");

    const input = screen.getByLabelText("Filtrar listas por nome");
    fireEvent.change(input, { target: { value: "zzz" } });

    // botão continua clicável e cria nova lista (push acumula: 1 do setup + 1 do clique)
    const pushAntes = pushMock.mock.calls.length;
    const botao = screen.getByText("Nova lista");
    fireEvent.click(botao);
    expect(pushMock.mock.calls.length).toBe(pushAntes + 1);
  });
});