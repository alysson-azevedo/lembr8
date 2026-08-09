// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// next/navigation: useRouter (client) e redirect (server, no layout).
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));

// Supabase server: cliente fake com sessão controlável por teste.
let fakeUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
  }),
}));

import { ListasIndex } from "@/components/listas/ListasIndex";
import { ListaScreen } from "@/components/listas/ListaScreen";
import { __resetListasStoreForTests } from "@/lib/todos/store";
import * as appLayout from "@/app/(app)/layout";

beforeEach(() => {
  window.localStorage.clear();
  __resetListasStoreForTests();
  pushMock.mockClear();
  fakeUser = { id: "user-1" };
  // jsdom não implementa scrollIntoView.
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

describe("ListasIndex — índice de listas (CA 2, 3)", () => {
  it("usuário novo vê estado vazio e o botão 'Nova lista'", async () => {
    render(<ListasIndex />);
    expect(
      await screen.findByText(/Nenhuma lista ainda/),
    ).toBeInTheDocument();
    expect(screen.getByText("Nova lista")).toBeInTheDocument();
  });

  it("'Nova lista' cria 'Lista 1' e navega para a lista (CA 3)", async () => {
    render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    expect(pushMock).toHaveBeenCalledTimes(1);
    const path = pushMock.mock.calls[0][0] as string;
    expect(path).toMatch(/^\/listas\/[\w-]+$/);
  });

  it("listas persistem entre remontagens (CA 2)", async () => {
    const { unmount } = render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista")); // Lista 1
    fireEvent.click(screen.getByText("Nova lista")); // Lista 2
    unmount();
    render(<ListasIndex />);
    expect(await screen.findByText("Lista 1")).toBeInTheDocument();
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
  });

  it("linha do índice mostra nome + contagem de a-fazer e é um link para a lista", async () => {
    const { unmount } = render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista")); // cria e navega
    unmount();
    render(<ListasIndex />);
    const linha = await screen.findByText("Lista 1");
    const link = linha.closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toMatch(/^\/listas\//);
    expect(within(link!).getByText(/0 a fazer/)).toBeInTheDocument();
  });
});

describe("ListaScreen — seções a-fazer/concluídos (CA 4, 6)", () => {
  function newListaId(): string {
    render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    const path = pushMock.mock.calls[0][0] as string;
    cleanup();
    return path.replace("/listas/", "");
  }

  it("mostra a-fazer no topo e concluídos embaixo sob cabeçalho 'Concluídos' (CA 4)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    enter("Novo item", "leite");
    // conclui leite
    const leite = await screen.findByLabelText('Marcar "leite" como concluído');
    fireEvent.click(leite);

    // a-fazer: arroz; concluídos: leite
    expect(screen.getByText("arroz")).toBeInTheDocument();
    expect(screen.getByText("leite")).toBeInTheDocument();
    expect(screen.getByText("Concluídos")).toBeInTheDocument();
    // a-fazer (arroz) aparece antes da seção Concluídos
    const concluidos = screen.getByText("Concluídos").closest("div");
    const arroz = screen.getByText("arroz");
    expect(arroz.compareDocumentPosition(concluidos!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("estado vazio da lista quando não há itens (CA 4)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    expect(
      await screen.findByText(/Nenhum item ainda/),
    ).toBeInTheDocument();
  });

  it("marcar/desmarcar move entre as seções; estado persiste ao remontar (CA 6)", async () => {
    const id = newListaId();
    const { unmount } = render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const arroz = await screen.findByLabelText(
      'Marcar "arroz" como concluído',
    );
    fireEvent.click(arroz); // conclui
    expect(screen.getByText("Concluídos")).toBeInTheDocument();

    unmount();
    render(<ListaScreen listId={id} />);
    // ao reabrir, arroz continua concluído
    expect(
      await screen.findByLabelText('Reativar "arroz"'),
    ).toBeInTheDocument();
  });
});

describe("ListaScreen — reutilização e duplicado (CA 5, 6)", () => {
  function newListaId(): string {
    render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    const path = pushMock.mock.calls[0][0] as string;
    cleanup();
    return path.replace("/listas/", "");
  }

  it("adicionar texto de concluído reativa sem duplicata (CA 5)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    const arroz = await screen.findByLabelText(
      'Marcar "arroz" como concluído',
    );
    fireEvent.click(arroz); // conclui
    // re-adiciona mesmo texto
    enter("Novo item", "arroz");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(1); // sem duplicata
    // voltou a a-fazer (rótulo de marcar, não reativar)
    expect(
      screen.getByLabelText('Marcar "arroz" como concluído'),
    ).toBeInTheDocument();
  });

  it("adicionar texto de a-fazer existente não duplica e destaca o existente (CA 6)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "arroz");
    await screen.findByLabelText('Marcar "arroz" como concluído');
    enter("Novo item", "arroz"); // duplicado

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(1); // não duplicou
    // label destacado transitório
    const label = checkboxes[0].closest("label");
    expect(label?.className).toContain("bg-current/10");
  });

  it("match case-insensitive no duplicado ativo", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    enter("Novo item", "Arroz");
    await screen.findByLabelText('Marcar "Arroz" como concluído');
    enter("Novo item", "  arroz  ");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
});

describe("ListaScreen — renomear lista (CA 7)", () => {
  function newListaId(): string {
    render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    const path = pushMock.mock.calls[0][0] as string;
    cleanup();
    return path.replace("/listas/", "");
  }

  it("clicar no título vira input; Enter confirma e reflete no índice (CA 7)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    const titulo = await screen.findByText("Lista 1");
    fireEvent.click(titulo);
    const input = await screen.findByLabelText("Nome da lista");
    fireEvent.change(input, { target: { value: "Mercado" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // título atualizado
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    // persiste no índice
    cleanup();
    render(<ListasIndex />);
    expect(await screen.findByText("Mercado")).toBeInTheDocument();
  });

  it("Esc cancela a edição sem renomear", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    fireEvent.click(await screen.findByText("Lista 1"));
    const input = await screen.findByLabelText("Nome da lista");
    fireEvent.change(input, { target: { value: "Mercado" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByText("Lista 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome da lista")).toBeNull();
  });
});

describe("Gate de auth no layout compartilhado (CA 1)", () => {
  it("deslogado redireciona ao login", async () => {
    fakeUser = null;
    const Layout = appLayout.default;
    await expect(Layout({ children: <div>x</div> } as never)).rejects.toThrow(
      "redirect:/login",
    );
  });

  it("logado renderiza o conteúdo (shell) sem redirecionar", async () => {
    fakeUser = { id: "user-1" };
    const Layout = appLayout.default;
    const el = (await Layout({ children: <div>conteúdo</div> } as never)) as React.ReactElement;
    const { container } = render(el);
    expect(container.textContent).toContain("conteúdo");
    expect(container.textContent).toMatch(/Ambiente/);
  });
});