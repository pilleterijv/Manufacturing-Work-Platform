import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name:
      process.env.FLOORWORK_DEMO_MODE === "true" ? "Floorwork DEMO — sample data" : "Floorwork Manufacturing",
    short_name: process.env.FLOORWORK_DEMO_MODE === "true" ? "Floorwork DEMO" : "Floorwork",
    description: "Standard work, improvement ideas and department performance",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e85208",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
