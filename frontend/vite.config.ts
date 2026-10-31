import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET || (mode === "development" ? "http://localhost:8080" : "http://localhost:4000");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/uploads": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
