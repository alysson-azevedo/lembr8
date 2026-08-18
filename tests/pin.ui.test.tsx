// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
    replace: replaceMock,
  }),
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
  replaceMock.mockClear();
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

/** Nomes das listas na ordem em que aparecem no índice (topo → fim). */
function nomesEmOrdem(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.querySelector("span")?.textContent?.trim() ?? "")
    .filter((n) => n.startsWith("Lista "));
}

describe("ListasIndex — pin só em listas fixadas (indicador, não botão)", () => {
  it("lista não-fixada: sem pin na linha", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // sem botão/indicador de fixar no índice (fixar é no detalhe).
    expect(screen.queryByLabelText(/Fixar "Lista 1"/)).toBeNull();
    expect(screen.queryByText("📌")).toBeNull();
  });

  it("lista fixada: exibe o pin como indicador visual", async () => {
    const [id] = newListaIds(1);
    // fixa pelo detalhe (fluxo real — fixar não está no índice).
    render(<ListaScreen listId={id} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // pin visível como indicador (não botão).
    expect(screen.getByLabelText('Fixada: "Lista 1"')).toBeInTheDocument();
  });
});

describe("ListasIndex — fixar pelo detalhe reordena o índice (AC 1, 2, 5)", () => {
  it("fixar uma não-fixada move para o topo imediatamente (AC 1)", async () => {
    const [id1] = newListaIds(2);
    // fixa Lista 1 pelo detalhe.
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // fixadas vêm primeiro — Lista 1 no topo, depois Lista 2 (AC 5).
    expect(nomesEmOrdem()).toEqual(["Lista 1", "Lista 2"]);
  });

  it("desfixar devolve à posição por updated_at imediatamente (AC 2)", async () => {
    const [id1] = newListaIds(2);
    // fixa depois desfixa pelo detalhe.
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    await (await import("@testing-library/react")).waitFor(() =>
      expect(screen.queryByRole("menu")).toBeNull(),
    );
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Desfixar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // sem fixadas → índice por updated_at desc: Lista 1 no topo (toggle bumpa
    // updated_at, AC 8).
    expect(nomesEmOrdem()).toEqual(["Lista 1", "Lista 2"]);
    // sem pin na Lista 1 (não fixada).
    expect(screen.queryByLabelText('Fixada: "Lista 1"')).toBeNull();
  });

  it("sem confirmação ao fixar/desfixar (AC 4 — não destrutivo)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await (await import("@testing-library/react")).waitFor(() =>
      expect(screen.queryByRole("menu")).toBeNull(),
    );
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Desfixar lista" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ListasIndex — índice em sequência, sem headers (AC 14)", () => {
  it("sem fixadas: índice em sequência, sem headers 'Fixadas'/'Demais'", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
  });

  it("todas fixadas: índice em sequência, sem headers", async () => {
    const [id1, id2] = newListaIds(2);
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    render(<ListaScreen listId={id2} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
    expect(screen.getByText("Lista 1")).toBeInTheDocument();
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
  });
});

describe("ListasIndex — persistência do pinned entre remontagens (AC 10)", () => {
  it("fixada permanece fixada ao reabrir o índice", async () => {
    const [id1] = newListaIds(2);
    render(<ListaScreen listId={id1} />);
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    const { unmount } = render(<ListasIndex />);
    await screen.findByText("Lista 1");
    unmount();
    render(<ListasIndex />);
    // ao reabrir, Lista 1 continua fixada — no topo do índice.
    await screen.findByText("Lista 1");
    expect(nomesEmOrdem()[0]).toBe("Lista 1");
  });
});

describe("ListaScreen — item 'Fixar/Desfixar lista' no menu overflow (AC 3, 4)", () => {
  /** Abre o menu "⋮" do cabeçalho. */
  async function abrirMenu() {
    fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
  }

  it("menu expõe 'Fixar lista' quando não fixada (texto reflete o estado, AC 3)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const item = screen.getByRole("menuitem", { name: "Fixar lista" });
    expect(item.tagName).toBe("BUTTON");
    expect(item.className).toContain("min-h-11");
    expect(item).toHaveTextContent(/📌\s*Fixar lista/);
  });

  it("clicar em 'Fixar lista' fecha o menu, sem confirmação, e alterna o texto (AC 3, 4)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    // menu fechou, sem diálogo de confirmação.
    await (await import("@testing-library/react")).waitFor(() =>
      expect(screen.queryByRole("menu")).toBeNull(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // reabre: agora lê "Desfixar lista".
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Desfixar lista" })).toBeInTheDocument();
  });

  it("'Fixar lista' fica acima de '🗑️ Excluir lista' (não destrutivo primeiro)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const fixar = screen.getByRole("menuitem", { name: "Fixar lista" });
    const excluir = screen.getByRole("menuitem", { name: "Excluir lista" });
    expect(fixar.compareDocumentPosition(excluir)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("fixar pelo detalhe reflete no índice ao voltar (AC 1)", async () => {
    const [id] = newListaIds(2);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // a lista fixada pelo detalhe está no topo do índice.
    expect(nomesEmOrdem()[0]).toBe("Lista 1");
  });
});