// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
import { ListasArquivadas } from "@/components/listas/ListasArquivadas";
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

/** Cria uma lista via índice (Nova lista) e devolve o id. */
function newListaId(): string {
  render(<ListasIndex />);
  fireEvent.click(screen.getByText("Nova lista"));
  const path = pushMock.mock.calls[0][0] as string;
  cleanup();
  return path.replace("/listas/", "");
}

/** Cria N listas e devolve os ids na ordem de criação. */
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

/** Nomes das listas ativas na ordem do índice (topo → fim). */
function nomesAtivasEmOrdem(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => {
      const outer = a.querySelector("span");
      if (!outer) return "";
      const pin = outer.querySelector("span[aria-label]");
      if (pin) pin.remove();
      return outer.textContent?.trim() ?? "";
    })
    .filter((n) => n.startsWith("Lista "));
}

/** Abre o menu "⋮" do cabeçalho do detalhe. */
async function abrirMenu() {
  fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
}

describe("ListaScreen — item 'Arquivar/Desarquivar lista' no menu overflow (AC 1, 4, 5)", () => {
  it("menu expõe 'Arquivar lista' quando ativa (texto reflete o estado, AC 5)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const item = screen.getByRole("menuitem", { name: "Arquivar lista" });
    expect(item.tagName).toBe("BUTTON");
    expect(item.className).toContain("min-h-11");
    expect(item).toHaveTextContent(/🗃️\s*Arquivar lista/);
    expect(item.className).toContain("text-foreground");
  });

  it("'Arquivar lista' fica entre 'Copiar link' e '🗑️ Excluir lista' (não destrutivo no meio)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const arquivar = screen.getByRole("menuitem", { name: "Arquivar lista" });
    const copiar = screen.getByRole("menuitem", { name: "Copiar link" });
    const excluir = screen.getByRole("menuitem", { name: "Excluir lista" });
    // Copiar < Arquivar < Excluir (ordem no DOM).
    expect(copiar.compareDocumentPosition(arquivar)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(arquivar.compareDocumentPosition(excluir)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("clicar em 'Arquivar lista' abre o ConfirmDialog (AC 1)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Arquivar lista?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/sairá da tela inicial e ficará em Arquivadas/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/pode desarquivar a qualquer momento/)).toBeInTheDocument();
    // botão de confirmar não é vermelho (não destrutivo — aviso).
    const confirmar = within(dialog).getByText("Arquivar");
    expect(confirmar.className).not.toContain("text-red");
  });

  it("confirmar arquiva: lista some do índice e menu lê 'Desarquivar lista' (AC 1, 2, 5)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    // o usuário permanece na tela da lista (sem redirect).
    expect(replaceMock).not.toHaveBeenCalled();
    // reabre o menu: agora lê "Desarquivar lista".
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Desarquivar lista" })).toBeInTheDocument();
    // a lista some do índice.
    cleanup();
    render(<ListasIndex />);
    await waitFor(() => expect(screen.queryByText("Lista 1")).toBeNull());
  });

  it("Cancelar no diálogo aborta e nada muda (AC 1)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Cancelar"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // reabre: ainda lê "Arquivar lista" (não arquivou).
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Arquivar lista" })).toBeInTheDocument();
  });

  it("desarquivar é sem confirmação (reversão trivial, AC 4/5)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Desarquivar lista" }));
    // sem diálogo de confirmação ao desarquivar.
    expect(screen.queryByRole("dialog")).toBeNull();
    // reabre: lê "Arquivar lista" de novo.
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Arquivar lista" })).toBeInTheDocument();
  });

  it("desarquivar devolve a lista à tela inicial (AC 4)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Desarquivar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    expect(nomesAtivasEmOrdem()).toContain("Lista 1");
  });
});

describe("ListasIndex — entrada 'Arquivadas' (AC 3)", () => {
  it("sem arquivadas: entrada 'Arquivadas' não aparece", async () => {
    newListaId();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    expect(screen.queryByText("Arquivadas")).toBeNull();
  });

  it("com arquivadas: entrada 'Arquivadas' aparece e linka para /arquivadas", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasIndex />);
    const link = await screen.findByText("Arquivadas");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/arquivadas");
  });

  it("arquivar a última ativa: estado vazio não mostra 'Nenhuma lista ainda' (entrada 'Arquivadas' cumpre o papel)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Arquivadas");
    // sem listas ativas, mas com arquivadas: não mostra o estado vazio.
    expect(screen.queryByText(/Nenhuma lista ainda/)).toBeNull();
  });
});

describe("ListasArquivadas — rota /arquivadas (AC 3, 4)", () => {
  it("lista as arquivadas por updated_at desc (AC 3)", async () => {
    const [idA, idB] = newListaIds(2);
    // arquiva ambas: A primeiro (mais velha), B depois (mais recente) → B, A.
    render(<ListaScreen listId={idA} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListaScreen listId={idB} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasArquivadas />);
    const nomes = screen
      .getAllByRole("link")
      .map((a) => a.querySelector("span")?.textContent?.trim() ?? "")
      .filter((n) => n.startsWith("Lista "));
    // B (arquivada mais recentemente) antes de A.
    expect(nomes).toEqual(["Lista 2", "Lista 1"]);
  });

  it("cada linha navega ao detalhe /listas/[id] (AC 4)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasArquivadas />);
    const link = await screen.findByText("Lista 1");
    const a = link.closest("a");
    expect(a?.getAttribute("href")).toMatch(/^\/listas\//);
  });

  it("estado vazio: 'Nenhuma lista arquivada' (AC 3)", async () => {
    render(<ListasArquivadas />);
    expect(
      await screen.findByText(/Nenhuma lista arquivada/),
    ).toBeInTheDocument();
  });

  it("pin preservado: lista arquivada fixada mostra 📌 (AC 12)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    // fixa antes de arquivar.
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasArquivadas />);
    expect(await screen.findByLabelText('Fixada: "Lista 1"')).toBeInTheDocument();
  });

  it("desarquivar pelo detalhe acessível via /arquivadas volta a lista ao índice (AC 4)", async () => {
    const [id] = newListaIds(1);
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    // acessa o detalhe pela rota de arquivadas.
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Desarquivar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // a lista voltou à tela inicial.
    expect(nomesAtivasEmOrdem()).toContain("Lista 1");
  });
});

describe("Interação com fixação (AC 12) — arquivar fixada e desarquivar volta a Fixadas", () => {
  it("arquivar fixada remove do índice; desarquivar volta à seção Fixadas (AC 12)", async () => {
    const [id1] = newListaIds(2);
    // fixa Lista 1.
    render(<ListaScreen listId={id1} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Fixar lista" }));
    cleanup();
    // arquiva Lista 1.
    render(<ListaScreen listId={id1} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Arquivar lista" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Arquivar"));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 2");
    // Lista 1 não aparece no índice (somente Lista 2 ativa).
    expect(screen.queryByText("Lista 1")).toBeNull();
    // desarquiva pelo detalhe.
    cleanup();
    render(<ListaScreen listId={id1} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Desarquivar lista" }));
    cleanup();
    render(<ListasIndex />);
    await screen.findByText("Lista 1");
    // Lista 1 volta ao topo (Fixadas) — pin preservado.
    expect(screen.getByLabelText('Fixada: "Lista 1"')).toBeInTheDocument();
    // Lista 2 também está presente (não fixada, abaixo).
    expect(screen.getByText("Lista 2")).toBeInTheDocument();
  });
});

describe("No-regression: menu mantém Fixar/Copiar/Excluir (AC 13)", () => {
  it("menu preserva os itens de LB-8/LB-12/LB-14", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    expect(screen.getByRole("menuitem", { name: "Fixar lista" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copiar link" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Excluir lista" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Arquivar lista" })).toBeInTheDocument();
  });

  it("excluir lista continua abrindo ConfirmDialog destrutivo (vermelho)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const excluir = screen.getByRole("menuitem", { name: "Excluir lista" });
    expect(excluir.className).toContain("text-red");
  });
});