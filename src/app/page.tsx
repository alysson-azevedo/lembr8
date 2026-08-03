import { getBuildInfo } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export default function Home() {
  const { environment, commit } = getBuildInfo();

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[28rem] p-6">
        <h1 className="text-3xl font-semibold">Lembr8</h1>
        <p className="mt-2">App de lembretes. Em construção.</p>
        <div className="mt-8 space-y-1 font-mono text-[0.8rem] text-muted">
          <p>Ambiente: {environment}</p>
          <p>Build: {commit}</p>
        </div>
      </div>
    </main>
  );
}
