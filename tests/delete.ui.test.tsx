// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

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

/** Helper: digitarr + Enter num input rotulado. */
function enter(label: string, texto: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.keyDown(input, { key: "Enter" });
}

/** Cria uma lista via índice e devolve o id para montar a tela da lista. */
function newListaId(): string {
  render(<ListasIndex />);
  fireEvent.click(screen.getByText("Nova lista"));
  const path = pushMock.mock.calls[0][0] as string;
  cleanup();
  return path.replace("/listas/", "");
}

describe("ListaScreen — affordance de excluir item (LB-8 AC 1, 2)", () => {
  it("botão '×' visível em a-fazer com alvo ≥44px (min-h-11 min-w-11) e aria-label", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const btn = await screen.findByLabelText('Excluir "arroz"');
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
  });

  it("botão '×' visível também em concluídos", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const checkbox = await screen.findByLabelText(
      'Marcar "arroz" como concluído',
    );
    fireEvent.click(checkbox); // conclui
    expect(await screen.findByLabelText('Excluir "arroz"')).toBeInTheDocument();
  });

  it("o '×' fica fora do <label>: clicar nele NÃO alterna o item", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const btn = await screen.findByLabelText('Excluir "arroz"');
    // o label de toggle não contém o botão de excluir.
    const label = screen.getByLabelText('Marcar "arroz" como concluído').closest("label");
    expect(label).not.toContainElement(btn);
  });
});

describe("ConfirmDialog — confirmação de exclusão de item (LB-8 AC 3)", () => {
  it("clicar no '×' abre o diálogo; confirmar remove o item imediatamente", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const btn = await screen.findByLabelText('Excluir "arroz"');
    fireEvent.click(btn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Excluir item?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Esta ação não pode ser desfeita/),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Excluir"));
    await waitFor(() => expect(screen.queryByText("arroz")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancelar aborta e nada é removido", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    fireEvent.click(await screen.findByLabelText('Excluir "arroz"'));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Cancelar"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("arroz")).toBeInTheDocument();
  });

  it("Esc cancela sem remover", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    fireEvent.click(await screen.findByLabelText('Excluir "arroz"'));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("arroz")).toBeInTheDocument();
  });

  it("clique no overlay (fora do card) cancela sem remover", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    fireEvent.click(await screen.findByLabelText('Excluir "arroz"'));
    const overlay = await screen.findByRole("dialog");
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("arroz")).toBeInTheDocument();
  });

  it("foco inicial no botão Cancelar (ação não-destrutiva)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    fireEvent.click(await screen.findByLabelText('Excluir "arroz"'));
    const cancelar = await screen.findByText("Cancelar");
    await waitFor(() => expect(cancelar).toHaveFocus());
  });
});

describe("ListaScreen — excluir lista do detalhe (LB-8 AC 2, 3)", () => {
  it("botão 'Excluir lista' no rodapé; confirma e redireciona a '/'", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    const btn = await screen.findByText("Excluir lista");
    expect(btn.className).toContain("text-red-600");
    fireEvent.click(btn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Excluir lista?")).toBeInTheDocument();
    // avisa que os itens vão junto (AC 3).
    expect(
      within(dialog).getByText(/e todos os seus itens/),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Excluir lista"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("Cancelar a exclusão de lista mantém a lista", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    fireEvent.click(await screen.findByText("Excluir lista"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Cancelar"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("arroz")).toBeInTheDocument();
    expect(screen.getByText("Excluir lista")).toBeInTheDocument();
  });

  it("excluir a lista remove seus itens em cascade", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    enter("Novo item", "feijão");
    fireEvent.click(await screen.findByText("Excluir lista"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Excluir lista"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));

    // a lista some do índice (cascade: itens também).
    cleanup();
    render(<ListasIndex />);
    await waitFor(() =>
      expect(screen.queryByText(/a fazer/)).toBeNull(),
    );
  });
});

describe("ListaScreen — deep-link para lista inexistente (LB-8 §4)", () => {
  it("lista inexistente redireciona a '/' após hidratação", async () => {
    render(<ListaScreen listId="id-que-nao-existe" />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });
});

describe("ListasIndex — affordance de excluir lista no índice (LB-8 AC 2, 3)", () => {
  it("cada linha tem '×' com alvo ≥44px e aria-label com o nome", async () => {
    const { unmount } = render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    unmount();
    render(<ListasIndex />);
    const btn = await screen.findByLabelText(/Excluir lista "Lista 1"/);
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
  });

  it("confirmar a exclusão no índice remove a linha", async () => {
    const { unmount } = render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    fireEvent.click(screen.getByText("Nova lista")); // Lista 2
    unmount();
    render(<ListasIndex />);
    const linha1 = await screen.findByLabelText(/Excluir lista "Lista 1"/);
    fireEvent.click(linha1);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/e todos os seus itens/),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Excluir lista"));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Excluir lista "Lista 1"/)).toBeNull(),
    );
    // Lista 2 permanece.
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
  });

  it("Cancelar no índice mantém a lista", async () => {
    const { unmount } = render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    unmount();
    render(<ListasIndex />);
    fireEvent.click(await screen.findByLabelText(/Excluir lista "Lista 1"/));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Cancelar"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Lista 1")).toBeInTheDocument();
  });
});