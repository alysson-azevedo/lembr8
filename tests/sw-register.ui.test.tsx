// @vitest-environment jsdom
// LB-27 — registro do SW: só em produção, guard para browsers sem suporte,
// falha vira warn (nunca unhandled rejection).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { ServiceWorkerRegister } from "../src/components/pwa/ServiceWorkerRegister";

const registerMock = vi.fn();

function setServiceWorker(value: { register: typeof registerMock } | undefined) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value,
    configurable: true,
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  registerMock.mockReset();
  setServiceWorker({ register: registerMock });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // Restaura o jsdom ao estado sem suporte (não existe serviceWorker ali).
  setServiceWorker(undefined);
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("LB-27 — ServiceWorkerRegister", () => {
  it("não registra fora de produção (next dev / test)", () => {
    render(<ServiceWorkerRegister />);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("registra /sw.js uma única vez em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    registerMock.mockResolvedValueOnce({ active: {} });
    render(<ServiceWorkerRegister />);
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });

  it("não lança nem registra quando o browser não tem suporte", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("falha de registro vira warn, sem unhandled rejection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    registerMock.mockRejectedValueOnce(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ServiceWorkerRegister />);
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled());
    await flush(); // deixa a rejeição assentar — se não for tratada, o suite falha
    expect(warn).toHaveBeenCalledWith(
      "[sw] registro falhou:",
      expect.any(Error),
    );
  });
});
