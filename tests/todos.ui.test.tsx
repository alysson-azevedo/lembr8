// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodoList } from "@/components/todos/TodoList";
import { __resetTodoStoreForTests } from "@/lib/todos/store";

/**
 * Testes de UI do TodoList (jsdom) contra os critérios de aceite 2, 3, 4 e 5.
 * O componente consome a camada única de acesso aos dados, que por sua vez usa
 * o `localStorage` do jsdom — simulando fechar/reabrir ao remontar com o mesmo
 * storage.
 */

beforeEach(() => {
  window.localStorage.clear();
  __resetTodoStoreForTests();
});

afterEach(() => {
  cleanup();
});

describe("TodoList — estado vazio (CA 2)", () => {
  it("sem itens, mostra o estado vazio com o campo de entrada disponível", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item");
    expect(input).toBeInTheDocument();
    expect(await screen.findByText(/Nenhum item ainda/)).toBeInTheDocument();
  });
});

describe("TodoList — entrada inline (CA 3)", () => {
  it("digitar texto + Enter adiciona o item com checkbox ao lado e limpa o campo", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "arroz" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("arroz")).toBeInTheDocument();
    expect(input.value).toBe(""); // campo limpo
    // checkbox ao lado do item
    expect(
      screen.getByLabelText('Marcar "arroz" como concluído'),
    ).toBeInTheDocument();
  });

  it("não há botão de salvar", () => {
    render(<TodoList />);
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
    // nenhum botão de submit no formulário de entrada
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });

  it("Enter com campo vazio não adiciona item", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    // continua no estado vazio
    expect(await screen.findByText(/Nenhum item ainda/)).toBeInTheDocument();
  });

  it("mantém a ordem de inserção", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    for (const texto of ["arroz", "feijão", "pães"]) {
      fireEvent.change(input, { target: { value: texto } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    expect(
      (await screen.findAllByRole("checkbox")).map((c) => c),
    ).toHaveLength(3);
    const spans = screen.getAllByText(/arroz|feijão|pães/);
    expect(spans.map((s) => s.textContent)).toEqual(["arroz", "feijão", "pães"]);
  });
});

describe("TodoList — checkbox alterna conclusão (CA 4)", () => {
  it("marcar o checkbox alterna concluído / a fazer e reflete visualmente", async () => {
    render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "arroz" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const checkbox = await screen.findByLabelText(
      'Marcar "arroz" como concluído',
    );
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // o texto do item passa a riscado/muted
    const span = screen.getByText("arroz");
    expect(span.className).toContain("line-through");

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("arroz").className).not.toContain("line-through");
  });
});

describe("TodoList — persistência ao reabrir (CA 5)", () => {
  it("fechar e reabrir mantém itens e estados de conclusão", async () => {
    const { unmount } = render(<TodoList />);
    const input = screen.getByLabelText("Novo item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "arroz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "feijão" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const arroz = await screen.findByLabelText('Marcar "arroz" como concluído');
    fireEvent.click(arroz); // arroz concluído

    // "fecha o app"
    unmount();

    // "reabre": novo TodoList lê do mesmo localStorage do jsdom
    render(<TodoList />);
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked(); // arroz concluído
    expect(checkboxes[1]).not.toBeChecked(); // feijão a fazer
    expect(screen.getByText("arroz").className).toContain("line-through");
    expect(screen.getByText("feijão").className).not.toContain("line-through");
  });
});