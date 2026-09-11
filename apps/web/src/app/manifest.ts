import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CataPreço",
    short_name: "CataPreço",
    description: "Rastreador de preços self-hosted para marketplaces brasileiros e internacionais",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#16a34a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
