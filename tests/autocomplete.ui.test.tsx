// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

// next/navigation: useRouter (client) — não usamos redirect aqui.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));

// Supabase server: cliente fake com sessão controlável por teste.
let fakeUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
  }),
}));

import { ListaScreen } from "@/components/listas/ListaScreen";
import {
  __resetListasStoreForTests,
  addItemToLista,
  createList,
} from "@/lib/todos/store";

/**
 * Autocomplete da UI (LB-13): combobox no campo de novo item. Cobre AC 1, 2, 4,
 * 5, 7, 8, 9, 10, 13. Usa o store real (cache localStorage em jsdom) semeado com
 * itens em listas auxiliares — as sugestões vêm de **todas** as listas (AC 3).
 */

const LISTBOX_ID = "sugestoes-novo-item";

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

/** Cria uma lista e adiciona os textos como itens a-fazer; devolve o id. */
function seedList(...textos: string[]): string {
  const lista = createList();
  for (const texto of textos) addItemToLista(lista.id, texto);
  return lista.id;
}

/** Nova lista vazia (corrente) para renderizar a ListaScreen. */
function newEmptyListId(): string {
  return createList().id;
}

/** O input combobox rotulado "Novo item". */
function novoItemInput(): HTMLInputElement {
  return screen.getByLabelText("Novo item") as HTMLInputElement;
}

/** Digita (change) texto no input. */
function digitar(texto: string) {
  fireEvent.change(novoItemInput(), { target: { value: texto } });
}

describe("ListaScreen — autocomplete dropdown (AC 1, 2, 3)", () => {
  it("digitar prefixo abre listbox com sugestões de itens de outras listas (AC 1, 3)", () => {
    seedList("Arroz", "Leite", "Café");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("ar");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(within(listbox).getByText("Arroz")).toBeInTheDocument();
    // Leite/Café não casam "ar" → não aparecem.
    expect(within(listbox).queryByText("Leite")).toBeNull();
  });

  it("AC 2 — insensível a acento/caixa: 'cafe' sugere 'Café'", () => {
    seedList("Café");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("cafe");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Café")).toBeInTheDocument();
  });

  it("campo vazio não abre listbox (sugestões só a partir do 1º caractere)", () => {
    seedList("Arroz");
    render(<ListaScreen listId={newEmptyListId()} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sem matches o dropdown fecha sozinho", () => {
    seedList("Arroz");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("zzz");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("máximo 6 sugestões exibidas (AC 6)", () => {
    seedList("a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("a");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(6);
  });
});

describe("ListaScreen — teclado no combobox (AC 7, 10)", () => {
  beforeEach(() => {
    seedList("Arroz", "Aveia", "Açaí");
  });

  it("↓ destaca a primeira option; ↓ novamente avança; ↑ recua (AC 7)", () => {
    render(<ListaScreen listId={newEmptyListId()} />);
    const input = novoItemInput();
    digitar("a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      `${LISTBOX_ID}-opt-0`,
    );
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      `${LISTBOX_ID}-opt-1`,
    );

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      `${LISTBOX_ID}-opt-0`,
    );
  });

  it("Enter com destaque ativo preenche o campo e fecha o listbox (não cria item) (AC 4, 5)", () => {
    const currentId = newEmptyListId();
    render(<ListaScreen listId={currentId} />);
    const input = novoItemInput();
    digitar("a");
    // A primeira suggestion depende do desempate por `updatedAt` (mais recente
    // primeiro); como o seed é síncrono e os timestamps podem empatar no mesmo
    // milissegundo, capturamos dinamicamente qual é a option em destaque em vez
    // de fixar o texto — o AC 4/5 verifica "Enter no destaque preenche o campo",
    // não qual texto especificamente.
    const primeira = screen.getAllByRole("option")[0].textContent;
    fireEvent.keyDown(input, { key: "ArrowDown" }); // destaca a 1ª option
    fireEvent.keyDown(input, { key: "Enter" });

    // campo preenchido com o texto sugerido; dropdown fechado.
    expect(input.value).toBe(primeira);
    expect(screen.queryByRole("listbox")).toBeNull();
    // NÃO criou item: nenhum checkbox na lista corrente.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("Enter sem destaque cria o item digitado (comportamento LB-3 preservado) (AC 14)", () => {
    seedList("Arroz"); // garante que há sugestão, mas não destaca
    const currentId = newEmptyListId();
    render(<ListaScreen listId={currentId} />);
    const input = novoItemInput();
    digitar("arroz");
    // sem ↓ → ativoIdx null → Enter cria o texto digitado.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("Esc fecha o listbox sem limpar o campo (AC 9)", () => {
    render(<ListaScreen listId={newEmptyListId()} />);
    const input = novoItemInput();
    digitar("a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.value).toBe("a"); // campo preservado
  });

  it("aria-expanded/aria-controls/aria-autocomplete no combobox (AC 10)", () => {
    render(<ListaScreen listId={newEmptyListId()} />);
    const input = novoItemInput();
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input.getAttribute("aria-controls")).toBe(LISTBOX_ID);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    digitar("a");
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ListaScreen — toque/selection no mobile (AC 4, 8)", () => {
  it("click numa option preenche o campo e fecha (onMouseDown preventDefault mantém foco)", () => {
    seedList("Arroz");
    render(<ListaScreen listId={newEmptyListId()} />);
    const input = novoItemInput();
    digitar("a");
    const option = screen.getByText("Arroz");
    // simula a sequência real: mouseDown (preventDefault) → click.
    fireEvent.mouseDown(option, { button: 0 });
    fireEvent.click(option);
    expect(input.value).toBe("Arroz");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("cada option é role=option com classe min-h-11 (alvo ≥44px, AC 8)", () => {
    seedList("Arroz", "Aveia");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("a");
    const options = screen.getAllByRole("option");
    for (const opt of options) {
      expect(opt.className).toContain("min-h-11");
      expect(opt.className).toContain("w-full");
    }
  });
});

describe("ListaScreen — fechar ao clicar fora (AC 9)", () => {
  it("blur do input fecha o listbox após o timeout", async () => {
    seedList("Arroz");
    render(<ListaScreen listId={newEmptyListId()} />);
    digitar("a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.blur(novoItemInput());
    // onBlur agenda fechamento em 120ms para o click da option registrar.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("ListaScreen — sem regressão nos fluxos anteriores (AC 14)", () => {
  it("adicionar item por Enter funciona normalmente (LB-3)", () => {
    const id = newEmptyListId();
    render(<ListaScreen listId={id} />);
    digitar("Pão");
    fireEvent.keyDown(novoItemInput(), { key: "Enter" });
    expect(
      screen.getByLabelText('Marcar "Pão" como concluído'),
    ).toBeInTheDocument();
  });

  it("toggle/concluídos e menu overflow '⋮' seguem intactos", () => {
    const id = newEmptyListId();
    render(<ListaScreen listId={id} />);
    digitar("Pão");
    fireEvent.keyDown(novoItemInput(), { key: "Enter" });
    const cb = screen.getByLabelText('Marcar "Pão" como concluído');
    fireEvent.click(cb);
    expect(screen.getByText("Concluídos")).toBeInTheDocument();
    // menu overflow presente e abre.
    const menu = screen.getByLabelText("Mais opções da lista");
    fireEvent.click(menu);
    expect(screen.getByText("Excluir lista")).toBeInTheDocument();
  });

  it("nenhum import de supabase/localStorage nos componentes (AC 13)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/listas/ListaScreen.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'].*supabase/);
    expect(src).not.toMatch(/localStorage/);
  });
});