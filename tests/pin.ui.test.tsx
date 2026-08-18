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

describe("ListasIndex — botão de fixar na linha (AC 3, LB-4 touch)", () => {
  it("cada linha tem um botão 📌 fora do <Link>, com alvo ≥44px e aria-label", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    const btn = await screen.findByLabelText('Fixar "Lista 1"');
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
    // o pin fica fora do link de navegação (clicar não navega).
    const link = screen.getByText("Lista 1").closest("a");
    expect(link).not.toContainElement(btn);
  });

  it("clicar no pin NÃO navega (não dispara router.push)", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    pushMock.mockClear();
    const btn = await screen.findByLabelText('Fixar "Lista 1"');
    fireEvent.click(btn);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("ListasIndex — toggle fixar/desfixar reordena o índice (AC 1, 2, 5)", () => {
  it("fixar uma não-fixada move para o topo imediatamente (AC 1)", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // inicialmente por updated_at desc: Lista 2 (criada depois) no topo.
    expect(nomesEmOrdem()).toEqual(["Lista 2", "Lista 1"]);

    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"'));
    // fixadas vêm primeiro — Lista 1 no topo, depois Lista 2 (AC 5).
    expect(nomesEmOrdem()).toEqual(["Lista 1", "Lista 2"]);
    // o botão agora anuncia "Desfixar" (AC 3).
    expect(screen.getByLabelText('Desfixar "Lista 1"')).toBeInTheDocument();
  });

  it("desfixar devolve à posição por updated_at imediatamente (AC 2)", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"')); // fixa
    fireEvent.click(screen.getByLabelText('Desfixar "Lista 1"')); // desfixa
    // sem headers — índice único em sequência.
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
    // ambas as listas presentes.
    expect(screen.getByText("Lista 1")).toBeInTheDocument();
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
    expect(screen.getByLabelText('Fixar "Lista 1"')).toBeInTheDocument();
  });

  it("sem confirmação ao fixar/desfixar (AC 4 — não destrutivo)", async () => {
    newListaIds(1);
    render(<ListasIndex />);
    const btn = await screen.findByLabelText('Fixar "Lista 1"');
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText('Desfixar "Lista 1"'));
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
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"'));
    fireEvent.click(screen.getByLabelText('Fixar "Lista 2"'));
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
    expect(screen.getByText("Lista 1")).toBeInTheDocument();
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
  });
});

describe("ListasIndex — persistência do pinned entre remontagens (AC 10)", () => {
  it("fixada permanece fixada ao reabrir o índice", async () => {
    newListaIds(2);
    const { unmount } = render(<ListasIndex />);
    await screen.findByText("Lista 1");
    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"'));
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