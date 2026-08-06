/**
 * Validação do formulário de login — critério de aceite 5: campos vazios ou
 * e-mail em formato inválido bloqueiam o envio com feedback visível.
 * Função pura, testável isoladamente.
 */
export type LoginErrors = {
  email?: string;
  password?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};

  if (!email.trim()) {
    errors.email = "Informe seu e-mail.";
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.email = "E-mail em formato inválido.";
  }

  if (!password) {
    errors.password = "Informe sua senha.";
  }

  return errors;
}