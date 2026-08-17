// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard, listaDeepLink } from "@/lib/clipboard/copyLink";

const ORIGIN = window.location.origin; // jsdom: http://localhost:3000

/** Define/restaura navigator.clipboard.writeText controladamente. */
function setClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  if (!writeText) {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    return;
  }
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
}

function clipboardMock(): ReturnType<typeof vi.fn> | undefined {
  const c = (navigator as unknown as { clipboard?: { writeText: unknown } }).clipboard;
  return c?.writeText as ReturnType<typeof vi.fn> | undefined;
}

beforeEach(() => {
  // jsdom não implementa document.execCommand — fornece um mock controlável.
  document.execCommand = vi.fn(() => true);
});

afterEach(() => {
  // restaura clipboard (sem writeText) para o próximo teste não vazar estado.
  setClipboard(undefined);
});

describe("copyToClipboard (LB-12 §3)", () => {
  it("usa navigator.clipboard.writeText e retorna true quando resolve", async () => {
    setClipboard(async (t: string) => {
      void t; // simula cópia bem-sucedida
    });
    expect(await copyToClipboard("https://x/listas/abc")).toBe(true);
    expect(clipboardMock()).toHaveBeenCalledTimes(1);
    expect(clipboardMock()?.mock.calls[0][0]).toBe("https://x/listas/abc");
  });

  it("cai no fallback execCommand quando writeText rejeita (permissão negada)", async () => {
    setClipboard(() => Promise.reject(new Error("permissão negada")));
    document.execCommand = vi.fn(() => true);
    expect(await copyToClipboard("https://x/listas/abc")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("retorna false quando sem clipboard e execCommand retorna false", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    expect(await copyToClipboard("https://x/listas/abc")).toBe(false);
  });

  it("retorna false (sem throw) quando ambos os caminhos falham", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error("inseguro");
    });
    expect(await copyToClipboard("https://x/listas/abc")).toBe(false);
  });
});

describe("listaDeepLink (LB-12 §2)", () => {
  it("monta o deep link ${origin}/listas/${listId}", () => {
    expect(listaDeepLink("abc123")).toBe(`${ORIGIN}/listas/abc123`);
  });
});