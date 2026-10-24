// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Server action de logout: em jsdom não há servidor; mockamos para isolar o UI.
// (vi.mock é hoisted — usamos vi.hoisted para ter o mock disponível na factory.)
const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));
vi.mock("@/app/login/actions", () => ({
  logout: logoutMock,
}));

import { IndexHeaderMenu } from "@/components/listas/IndexHeaderMenu";
import IndexPage from "@/app/(app)/page";

// ListasIndex depende de next/navigation (useRouter) — page do índice o renderiza.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("IndexHeaderMenu — trigger e a11y (AC 2, 5)", () => {
  it("header do índice não renderiza 'Sair' visível por padrão (AC 1)", () => {
    render(<IndexHeaderMenu />);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mais opções" }),
    ).toBeInTheDocument();
  });

  it("trigger tem aria-haspopup=menu, aria-expanded=false e alvo ≥44px", () => {
    render(<IndexHeaderMenu />);
    const trigger = screen.getByRole("button", { name: "Mais opções" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger.className).toContain("min-h-11");
    expect(trigger.className).toContain("min-w-11");
  });
});

describe("IndexHeaderMenu — interações (AC 2, 4, 5, 6)", () => {
  it("clique no trigger abre menu com único item 'Sair' (menuitem)", () => {
    render(<IndexHeaderMenu />);
    const trigger = screen.getByRole("button", { name: "Mais opções" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = screen.getByRole("menu", { name: "Opções" });
    const itens = screen.getAllByRole("menuitem");
    expect(itens).toHaveLength(1);
    expect(itens[0]).toHaveTextContent("Sair");
    expect(itens[0]).toHaveAttribute("type", "submit");
    expect(menu).toContainElement(itens[0]);
    // Alvo ≥44px no item
    expect(itens[0].className).toContain("min-h-11");
  });

  it("clique no backdrop (fora) fecha o menu", () => {
    render(<IndexHeaderMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // backdrop é um button aria-hidden focável por click; dispara close
    const backdrop = document.querySelector("button.fixed.inset-0") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Esc fecha o menu e devolve foco ao trigger", () => {
    render(<IndexHeaderMenu />);
    const trigger = screen.getByRole("button", { name: "Mais opções" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("submit do item 'Sair' aciona a server action de logout", () => {
    render(<IndexHeaderMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    const item = screen.getByRole("menuitem", { name: /Sair/ });
    const form = item.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});

describe("IndexPage — índice usa menu e não o botão Sair direto (AC 1, 7)", () => {
  it("IndexPage renderiza trigger 'Mais opções' e não expõe 'Sair' no header", () => {
    render(<IndexPage />);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Mais opções" }),
    ).toBeInTheDocument();
  });
});
