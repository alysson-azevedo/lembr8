// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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

/** Devolve o `<section>` cujo header (texto) é `header`. */
function sectionByHeader(header: string): HTMLElement {
  const h = screen.getByText(header);
  // o <p> do header fica dentro do <section>.
  return h.closest("section")!;
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

describe("ListasIndex — toggle fixar/desfixar move entre seções (AC 1, 2, 5)", () => {
  it("fixar uma não-fixada move para a seção Fixadas imediatamente (AC 1)", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // inicialmente sem fixadas → sem headers.
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();

    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"'));
    // agora coexistem → headers aparecem, Fixadas acima de Demais (AC 5).
    const fixadas = screen.getByText("Fixadas");
    const demais = screen.getByText("Demais");
    expect(fixadas.compareDocumentPosition(demais)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Lista 1 está na seção Fixadas; Lista 2 na Demais.
    expect(within(sectionByHeader("Fixadas")).getByText("Lista 1")).toBeInTheDocument();
    expect(within(sectionByHeader("Demais")).getByText("Lista 2")).toBeInTheDocument();
    // o botão agora anuncia "Desfixar" (AC 3).
    expect(screen.getByLabelText('Desfixar "Lista 1"')).toBeInTheDocument();
  });

  it("desfixar devolve à seção Demais imediatamente (AC 2)", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"')); // fixa
    fireEvent.click(screen.getByLabelText('Desfixar "Lista 1"')); // desfixa
    // voltou a não coexistir → sem headers.
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
    // ambas as listas presentes no índice flat.
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

describe("ListasIndex — headers condicionais (AC 14)", () => {
  it("sem fixadas: índice flat, sem headers 'Fixadas'/'Demais'", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    expect(screen.queryByText("Fixadas")).toBeNull();
    expect(screen.queryByText("Demais")).toBeNull();
  });

  it("todas fixadas: só Fixadas, sem header 'Demais'", async () => {
    newListaIds(2);
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    fireEvent.click(screen.getByLabelText('Fixar "Lista 1"'));
    fireEvent.click(screen.getByLabelText('Fixar "Lista 2"'));
    expect(screen.queryByText("Fixadas")).toBeNull(); // só uma seção → sem header
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
    // ao reabrir, Lista 1 continua fixada (header presente).
    await screen.findByText("Fixadas");
    expect(within(sectionByHeader("Fixadas")).getByText("Lista 1")).toBeInTheDocument();
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
    await screen.findByText("Fixadas");
    // a lista fixada pelo detalhe está na seção Fixadas do índice.
    expect(within(sectionByHeader("Fixadas")).getByText("Lista 1")).toBeInTheDocument();
  });
});