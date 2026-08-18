// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

// next/navigation: redirect (server, no layout) e useRouter (client).
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

// Supabase server: cliente fake com sessão controlável por teste.
let fakeUser: { id: string } | null = { id: "user-1" };
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
  }),
}));

// A página de login usa uma server action; mockamos o módulo de actions para
// isolar o teste de credenciais/Supabase — queremos só saber se o rodapé
// (não) aparece na tela de /login.
vi.mock("@/app/login/actions", () => ({
  login: vi.fn(async () => ({}) as never),
}));

import * as appLayout from "@/app/(app)/layout";
import LoginPage from "@/app/login/page";

beforeEach(() => {
  fakeUser = { id: "user-1" };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

/** Renderiza o shell autenticado (grupo `(app)`) com um conteúdo de marca. */
async function renderShell(children = "conteúdo") {
  const Layout = appLayout.default;
  const el = (await Layout({ children: <div>{children}</div> } as never)) as React.ReactElement;
  return render(el);
}

describe("LB-11 — rodapé Ambiente/Build no shell autenticado", () => {
  it("CA 1: renderiza o rodapé fora do container de conteúdo (irmão dele no <main>)", async () => {
    const { container } = await renderShell("conteúdo");
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();

    // O rodapé é filho direto do <main>, não do container de conteúdo.
    expect(footer!.parentElement).toBe(main);

    // O container de conteúdo (que envolve "conteúdo") também é filho do <main>
    // e NÃO contém o bloco Ambiente/Build.
    const contentDiv = container.querySelector("main > div");
    expect(contentDiv).not.toBeNull();
    expect(contentDiv!.textContent).toContain("conteúdo");
    expect(contentDiv!.textContent).not.toMatch(/Ambiente/);
    expect(contentDiv!.textContent).not.toMatch(/Build/);
  });

  it("CA 3: mantém os textos e a origem dos dados de getBuildInfo() (development/local fora da Vercel)", async () => {
    const { container } = await renderShell();
    const footer = container.querySelector("footer")!;
    expect(footer.textContent).toContain("Ambiente: development");
    expect(footer.textContent).toContain("Build: local");
    // Separador middot discreto, escondido de leitores de tela.
    const sep = footer.querySelector('span[aria-hidden="true"]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toBe("·");
  });

  it("CA 4: rodapé respeita env(safe-area-inset-bottom) no padding inferior", async () => {
    const { container } = await renderShell();
    const footer = container.querySelector("footer")!;
    expect(footer.className).toContain("pb-[max(1.5rem,env(safe-area-inset-bottom))]");
    // Rodapé no fluxo (não fixed/sticky) — nunca sobrepõe nem empurra conteúdo.
    expect(footer.className).not.toMatch(/fixed|sticky/);
  });

  it("CA 6: sem regressão desktop — container e rodapé limitados a max-w-[28rem] e alinhados ao centro", async () => {
    const { container } = await renderShell();
    const contentDiv = container.querySelector("main > div");
    const footer = container.querySelector("footer");
    expect(contentDiv!.className).toContain("max-w-[28rem]");
    expect(footer!.className).toContain("max-w-[28rem]");
    expect(footer!.className).toContain("self-center");
    // Paleta de diagnóstico preservada.
    expect(footer!.className).toContain("font-mono");
    expect(footer!.className).toContain("text-muted");
    expect(footer!.className).toContain("text-[0.8rem]");
  });
});

describe("LB-15 — container de conteúdo empilha header acima (flex-col)", () => {
  it("o container é flex-col (row faria header e conteúdo ficarem lado a lado)", async () => {
    const { container } = await renderShell();
    const contentDiv = container.querySelector("main > div");
    expect(contentDiv!.className).toContain("flex-col");
    // Alinhamentos do eixo horizontal (row) quebrariam o empilhamento:
    // `justify-center` sozinho vira coluna lateral centralizada; `items-center`
    // em coluna encolheria os filhos horizontalmente.
    expect(contentDiv!.className).not.toContain("items-center");
    expect(contentDiv!.className).not.toContain("sm:items-center");
  });

  it("centraliza verticalmente: conteúdo no topo no mobile, centrado em sm+", async () => {
    const { container } = await renderShell();
    const contentDiv = container.querySelector("main > div");
    expect(contentDiv!.className).toContain("justify-start");
    expect(contentDiv!.className).toContain("sm:justify-center");
  });

  it("header e conteúdo de uma rota real (fragment com 2 irmãos) ficam empilhados", async () => {
    const Layout = appLayout.default;
    const el = (await Layout({
      children: (
        <>
          <div data-testid="header">header</div>
          <div data-testid="lista">lista</div>
        </>
      ),
    } as never)) as React.ReactElement;
    cleanup();
    const { container: c2 } = render(el);
    const contentDiv = c2.querySelector("main > div")!;
    // Os dois irmãos são filhos diretos do mesmo container flex-col: com
    // flex-direction column eles ocupam linhas distintas (header acima).
    expect(contentDiv.className).toContain("flex-col");
    const header = c2.querySelector('[data-testid="header"]')!;
    const lista = c2.querySelector('[data-testid="lista"]')!;
    expect(header.parentElement).toBe(contentDiv);
    expect(lista.parentElement).toBe(contentDiv);
    // Ordem no fluxo vertical: header antes da lista.
    expect(header.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("LB-11 — CA 2: rodapé só nas telas autenticadas (não em /login)", () => {
  it("a página de /login não renderiza o rodapé Ambiente/Build", () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector("footer")).toBeNull();
    expect(container.textContent).not.toMatch(/Ambiente/);
    expect(container.textContent).not.toMatch(/Build:/);
  });

  it("o shell autenticado (grupo `(app)`) renderiza o rodapé em todas as rotas", async () => {
    // O mesmo layout serve a `/` e `/listas/[id]`; qualquer children passa.
    const { container } = await renderShell("rota /");
    expect(container.querySelector("footer")).not.toBeNull();
    const { container: c2 } = await renderShell("rota /listas/[id]");
    expect(c2.querySelector("footer")).not.toBeNull();
  });
});