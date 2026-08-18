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
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: replaceMock }),
}));

let fakeUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
  }),
}));

// Clipboard controlado: copyToClipboard resolve true/false por teste; listaDeepLink determinístico.
const copyMock = vi.fn<(t: string) => Promise<boolean>>();
vi.mock("@/lib/clipboard/copyLink", () => ({
  copyToClipboard: (t: string) => copyMock(t),
  listaDeepLink: (id: string) => `http://localhost:3000/listas/${id}`,
}));

import { ListasIndex } from "@/components/listas/ListasIndex";
import { ListaScreen } from "@/components/listas/ListaScreen";
import { Toast } from "@/components/ui/Toast";
import { __resetListasStoreForTests } from "@/lib/todos/store";

beforeEach(() => {
  window.localStorage.clear();
  __resetListasStoreForTests();
  pushMock.mockClear();
  replaceMock.mockClear();
  copyMock.mockReset();
  copyMock.mockResolvedValue(true);
  fakeUser = { id: "user-1" };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

/** Cria uma lista via índice e devolve o id para montar a tela da lista. */
function newListaId(): string {
  render(<ListasIndex />);
  fireEvent.click(screen.getByText("Nova lista"));
  const path = pushMock.mock.calls[0][0] as string;
  cleanup();
  return path.replace("/listas/", "");
}

/** Abre o menu "⋮" do cabeçalho. */
async function abrirMenu() {
  fireEvent.click(await screen.findByLabelText("Mais opções da lista"));
}

describe("ListaScreen — 'Copiar link' no menu overflow (LB-12 AC 1)", () => {
  it("menu ⋮ expõe 'Copiar link' acima de 'Excluir lista' (ordem no DOM)", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();

    const itens = await screen.findAllByRole("menuitem");
    const nomes = itens.map((el) => el.textContent?.replace(/\s+/g, " ").trim());
    const idxCopiar = nomes.findIndex((n) => n === "🔗 Copiar link");
    const idxExcluir = nomes.findIndex((n) => n === "🗑️ Excluir lista");
    expect(idxCopiar).toBeGreaterThanOrEqual(0);
    expect(idxExcluir).toBeGreaterThanOrEqual(0);
    expect(idxCopiar).toBeLessThan(idxExcluir); // Copiar link antes de Excluir lista
  });

  it("item 'Copiar link' é não destrutivo (text-foreground), com ícone 🔗 e alvo 44px", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const item = screen.getByRole("menuitem", { name: "Copiar link" });
    expect(item.tagName).toBe("BUTTON");
    expect(item.className).toContain("text-foreground");
    expect(item.className).not.toContain("text-red");
    expect(item.className).toContain("min-h-11");
    expect(item.querySelector("span[aria-hidden='true']")).toHaveTextContent("🔗");
  });
});

describe("ListaScreen — copia o deep link e mostra toast (LB-12 AC 2, 3, 4)", () => {
  it("clicar em 'Copiar link' fecha o menu, copia o deep link e mostra toast 'Link copiado'", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const copiar = screen.getByRole("menuitem", { name: "Copiar link" });
    fireEvent.click(copiar);

    // menu fecha (AC 4)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // copiou o deep link da lista atual (AC 2)
    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(copyMock.mock.calls[0][0]).toBe(`http://localhost:3000/listas/${id}`);

    // toast de sucesso (AC 3)
    const status = await screen.findByRole("status");
    expect(within(status).getByText("Link copiado")).toBeInTheDocument();
  });

  it("copyToClipboard retornando false → toast 'Não foi possível copiar o link'", async () => {
    copyMock.mockResolvedValue(false);
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copiar link" }));
    const status = await screen.findByRole("status");
    expect(within(status).getByText("Não foi possível copiar o link")).toBeInTheDocument();
  });
});

describe("Toast — auto-fechamento (LB-12 §4)", () => {
  it("chama onClose após durationMs e some", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Toast open message="Link copiado" durationMs={1000} onClose={onClose} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não renderiza nada quando open é false", () => {
    render(<Toast open={false} message="x" onClose={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ListaScreen — sem regressão LB-8 (excluir lista)", () => {
  it("'🗑️ Excluir lista' continua abrindo o ConfirmDialog", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir lista" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Excluir lista?")).toBeInTheDocument();
  });

  it("clicar fora do menu (backdrop) o fecha sem copiar nem mostrar toast", async () => {
    const id = newListaId();
    render(<ListaScreen listId={id} />);
    await abrirMenu();
    const backdrop = document.querySelector('button[aria-hidden="true"]') as HTMLButtonElement;
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
    expect(copyMock).not.toHaveBeenCalled();
  });
});