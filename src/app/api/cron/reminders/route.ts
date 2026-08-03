import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint do cron da Vercel (ver `vercel.json`). Ainda não dispara lembretes —
 * a feature de notificações tem issue própria. Aqui só a proteção do endpoint.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET ausente" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, processed: 0 });
}
