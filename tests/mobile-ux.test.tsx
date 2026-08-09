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

import { TodoList } from "@/components/todos/TodoList";
import { __resetTodoStoreForTests } from "@/lib/todos/store";
import * as layout from "@/app/layout";

beforeEach(() => {
  window.localStorage.clear();
  __resetTodoStoreForTests();
});

afterEach(() => {
  cleanup();
});

/**
 * Testes de UX mobile da LB-4 contra critérios de aceite: viewport/safe area
 * (CA 1), alvos de toque ≥44px (CA 2), entrada inline com teclado mobile
 * (CA 3) e estado vazio legível (CA 4). Sem regressão de lógica — apenas
 * render/CSS/atributos.
 */

describe("layout — viewport e safe areas (CA 1)", () => {
  it("exporta `viewport` com viewportFit: cover e sem user-scalable=no", () => {
    expect(layout.viewport).toBeDefined();
    const vp = layout.viewport as Record<string, unknown>;
    expect(vp.width).toBe("device-width");
    expect(vp.initialScale).toBe(1);
    expect(vp.viewportFit).toBe("cover");
    // ausência de user-scalable=no (acessibilidade — permite zoom)
    expect(vp.userScalable).toBeUndefined();
    expect(JSON.stringify(vp)).not.toContain("user-scalable=no");
  });
});

describe("TodoList — entrada inline com teclado mobile (CA 3)", () => {
  it("input tem fonte ≥16px (text-base) e enterKeyHint=enter (sem autoFocus)", () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    expect(input.className).toContain("text-base");
    expect(input.getAttribute("enterKeyHint")).toBe("enter");
    expect(input.autofocus).toBeFalsy();
  });

  it("Enter/Return adiciona o item, limpa o campo e mantém o foco", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "leite" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("leite")).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(input).toHaveFocus();
  });
});

describe("TodoList — alvos de toque ≥44px (CA 2)", () => {
  it("cada item é um <label> com min-h-11 envolvendo checkbox size-5 + texto", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "pão" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const checkbox = await screen.findByLabelText('Marcar "pão" como concluído');
    // checkbox visual size-5
    expect(checkbox.className).toContain("size-5");
    // envolvido por <label> com min-h-11 (área de toque 44px)
    const label = checkbox.closest("label");
    expect(label).not.toBeNull();
    expect(label?.className).toContain("min-h-11");
    // o texto do item está dentro do mesmo <label>
    expect(label).toContainElement(screen.getByText("pão"));
  });

  it("clicar em qualquer ponto da linha (label) alterna o item", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "café" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const checkbox = await screen.findByLabelText('Marcar "café" como concluído');
    const label = checkbox.closest("label") as HTMLLabelElement;
    expect(checkbox).not.toBeChecked();

    // clicar no rótulo (não diretamente no checkbox) alterna
    fireEvent.click(label);
    expect(checkbox).toBeChecked();
  });
});

describe("TodoList — estado vazio legível no mobile (CA 4)", () => {
  it("estado vazio usa text-base (≥16px)", () => {
    render(<TodoList />);
    const empty = screen.getByText(/Nenhum item ainda/);
    expect(empty.className).toContain("text-base");
  });
});
