import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SENDER, sendEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sendEmail", () => {
  it("monta o payload esperado pela API do Brevo", async () => {
    vi.stubEnv("BREVO_API_KEY", "chave-de-teste");
    const fetchMock = stubFetch(
      Response.json({ messageId: "<abc@brevo>" }, { status: 201 }),
    );

    const result = await sendEmail({
      to: "destino@exemplo.com",
      subject: "Assunto",
      html: "<p>Corpo</p>",
    });

    expect(result).toEqual({ messageId: "<abc@brevo>" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("chave-de-teste");
    expect(JSON.parse(init.body)).toEqual({
      sender: DEFAULT_SENDER,
      to: [{ email: "destino@exemplo.com" }],
      subject: "Assunto",
      htmlContent: "<p>Corpo</p>",
    });
  });

  it("falha quando a API key não está configurada", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    await expect(
      sendEmail({ to: "a@b.com", subject: "s", html: "h" }),
    ).rejects.toThrow("BREVO_API_KEY");
  });

  it("propaga o erro devolvido pelo Brevo", async () => {
    vi.stubEnv("BREVO_API_KEY", "chave-de-teste");
    stubFetch(new Response("unauthorized", { status: 401 }));

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", html: "h" }),
    ).rejects.toThrow("Brevo respondeu 401");
  });
});
