import { describe, expect, it } from "vitest";
import { validateLogin } from "@/lib/validation";

describe("validateLogin (CA 5)", () => {
  it("não retorna erros para e-mail e senha válidos", () => {
    expect(validateLogin("user@exemplo.com", "senha123")).toEqual({});
  });

  it("bloqueia e-mail vazio", () => {
    expect(validateLogin("", "senha123").email).toBe("Informe seu e-mail.");
  });

  it("bloqueia senha vazia", () => {
    expect(validateLogin("user@exemplo.com", "").password).toBe(
      "Informe sua senha.",
    );
  });

  it("bloqueia ambos vazios", () => {
    const errors = validateLogin("", "");
    expect(errors.email).toBe("Informe seu e-mail.");
    expect(errors.password).toBe("Informe sua senha.");
  });

  it("rejeita e-mail em formato inválido", () => {
    expect(validateLogin("nao-e-email", "senha123").email).toBe(
      "E-mail em formato inválido.",
    );
    expect(validateLogin("user@", "senha123").email).toBe(
      "E-mail em formato inválido.",
    );
    expect(validateLogin("user@exemplo", "senha123").email).toBe(
      "E-mail em formato inválido.",
    );
  });
});