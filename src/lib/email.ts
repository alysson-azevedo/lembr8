/**
 * Envio de e-mail transacional pela API HTTP do Brevo — sem SDK.
 * A API key é server-only; nunca importar este módulo em código de browser.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export const DEFAULT_SENDER = {
  name: "Lembr8",
  email: "me@alyssonazevedo.dev",
} as const;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<{ messageId: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("Variável de ambiente ausente: BREVO_API_KEY");

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: DEFAULT_SENDER,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(text ? { textContent: text } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo respondeu ${response.status}: ${detail}`);
  }

  const body = (await response.json()) as { messageId: string };
  return { messageId: body.messageId };
}
