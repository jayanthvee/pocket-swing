import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // expose on LAN for phone testing (needs HTTPS — see README)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Pocket Swing",
        short_name: "PocketSwing",
        theme_color: "#0b6b3a",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "portrait",
      },
    }),
  ],
});
