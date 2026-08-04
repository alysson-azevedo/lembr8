/**
 * Smoke test do envio transacional pelo Brevo.
 *
 *   BREVO_API_KEY=... pnpm exec tsx scripts/send-test-email.ts <destinatário>
 *
 * Verifica ponta a ponta o que `src/lib/email.ts` faz em produção.
 */
import { sendEmail } from "../src/lib/email";

const to = process.argv[2];
if (!to) {
  console.error("Uso: send-test-email.ts <destinatário>");
  process.exit(1);
}

async function main() {
  const { messageId } = await sendEmail({
    to,
    subject: "Lembr8 — teste de e-mail transacional",
    html:
      "<p>Disparo de teste enviado pela API HTTP do Brevo a partir de " +
      "<code>src/lib/email.ts</code>.</p>" +
      "<p>Se você recebeu isto, o envio transacional está funcionando.</p>",
    text: "Disparo de teste do envio transacional do Lembr8 via API HTTP do Brevo.",
  });

  console.log("Enviado. messageId:", messageId);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
