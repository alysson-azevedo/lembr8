// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// next/font/google não roda no vitest (build-time); mockamos antes do import
// do layout para validar apenas a exportação `viewport`.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

// useRouter do next/navigation (client) — usado por ListasIndex (push no-op).
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { ListasIndex } from "@/components/listas/ListasIndex";
import { ListaScreen } from "@/components/listas/ListaScreen";
import { createList, __resetListasStoreForTests } from "@/lib/todos/store";
import * as rootLayout from "@/app/layout";

beforeEach(() => {
  window.localStorage.clear();
  __resetListasStoreForTests();
});

afterEach(() => {
  cleanup();
});

/** Cria uma lista no store e devolve o id para montar a tela da lista. */
function criarListaId(): string {
  return createList().id;
}

describe("layout — viewport e safe areas (CA 1 — sem regressão LB-4)", () => {
  it("exporta `viewport` com viewportFit: cover e sem user-scalable=no", () => {
    expect(rootLayout.viewport).toBeDefined();
    const vp = rootLayout.viewport as Record<string, unknown>;
    expect(vp.width).toBe("device-width");
    expect(vp.initialScale).toBe(1);
    expect(vp.viewportFit).toBe("cover");
    expect(vp.userScalable).toBeUndefined();
    expect(JSON.stringify(vp)).not.toContain("user-scalable=no");
  });
});

describe("ListasIndex — alvos de toque ≥44px (CA 2)", () => {
  it("botão 'Nova lista' tem min-h-11 e text-base", () => {
    render(<ListasIndex />);
    const btn = screen.getByText("Nova lista");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("text-base");
    expect(btn.className).toContain("w-full");
  });

  it("cada linha do índice é um link com min-h-11 e text-base", async () => {
    render(<ListasIndex />);
    fireEvent.click(screen.getByText("Nova lista"));
    const linha = await screen.findByText("Lista 1");
    const link = linha.closest("a");
    expect(link?.className).toContain("min-h-11");
    expect(link?.className).toContain("text-base");
  });

  it("estado vazio usa text-base (≥16px)", () => {
    render(<ListasIndex />);
    const empty = screen.getByText(/Nenhuma lista ainda/);
    expect(empty.className).toContain("text-base");
  });
});

describe("ListaScreen — entrada inline com teclado mobile (CA 3 — sem regressão)", () => {
  it("input tem fonte ≥16px (text-base) e enterKeyHint=enter (sem autoFocus)", () => {
    const id = criarListaId();
    render(<ListaScreen listId={id} />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    expect(input.className).toContain("text-base");
    expect(input.getAttribute("enterKeyHint")).toBe("enter");
    expect(input.autofocus).toBeFalsy();
  });

  it("Enter adiciona o item, limpa o campo e mantém o foco", async () => {
    const id = criarListaId();
    render(<ListaScreen listId={id} />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "leite" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("leite")).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(input).toHaveFocus();
  });
});

describe("ListaScreen — alvos de toque ≥44px (CA 2)", () => {
  it("cada item é um <label> com min-h-11 envolvendo checkbox size-5 + texto", async () => {
    const id = criarListaId();
    render(<ListaScreen listId={id} />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "pão" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const checkbox = await screen.findByLabelText(
      'Marcar "pão" como concluído',
    );
    expect(checkbox.className).toContain("size-5");
    const label = checkbox.closest("label");
    expect(label).not.toBeNull();
    expect(label?.className).toContain("min-h-11");
    expect(label).toContainElement(screen.getByText("pão"));
  });

  it("clicar em qualquer ponto da linha (label) alterna o item", async () => {
    const id = criarListaId();
    render(<ListaScreen listId={id} />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "café" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const checkbox = await screen.findByLabelText(
      'Marcar "café" como concluído',
    );
    const label = checkbox.closest("label") as HTMLLabelElement;
    expect(checkbox).not.toBeChecked();
    fireEvent.click(label);
    expect(checkbox).toBeChecked();
  });

  it("texto concluído fica riscado/muted (line-through text-muted)", async () => {
    const id = criarListaId();
    render(<ListaScreen listId={id} />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "chá" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const checkbox = await screen.findByLabelText(
      'Marcar "chá" como concluído',
    );
    fireEvent.click(checkbox);
    const span = screen.getByText("chá");
    expect(span.className).toContain("line-through");
    expect(span.className).toContain("text-muted");
  });
});