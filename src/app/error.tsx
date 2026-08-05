"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[28rem] p-6">
        <h1 className="text-3xl font-semibold">Algo deu errado</h1>
        <p className="mt-2">Tente novamente em instantes.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 rounded border border-current px-4 py-2 text-sm"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
