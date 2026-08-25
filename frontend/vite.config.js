import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  appType: "spa",
  server: {
    port: 5178,
    host: true, // listen on 0.0.0.0 so the app is reachable beyond localhost
    allowedHosts: true, // allow reverse-proxied/preview hostnames
    proxy: {
      // Forward API calls to the Express backend (keeps same-origin cookies).
      "/api": {
        target: "http://localhost:8004",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
  },
});
