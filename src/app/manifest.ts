import type { MetadataRoute } from "next";

// PWA instalável (LB-27): ícones estáticos em public/icons/ com tamanho real
// declarado (o Chromium exige ≥144px para o critério de installability).
// theme/background = JuxTheme `#1c1c23` (LB-21; ADR 2026-10-24).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lembr8",
    short_name: "Lembr8",
    description: "Registre suas tarefas e seja lembrado na hora certa.",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1c23",
    theme_color: "#1c1c23",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
