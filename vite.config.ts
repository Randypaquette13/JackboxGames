import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const wsTarget = env.VITE_WS_PROXY_TARGET || "http://127.0.0.1:3001";

  return {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          join: resolve(__dirname, "join.html"),
        },
      },
    },
    server: {
      /** Listen on LAN (0.0.0.0) so phones can open http://<your-ip>:5173 — not just localhost */
      host: true,
      port: 5173,
      // Allow ngrok / Cloudflare Tunnel / etc. (Host header is not localhost)
      allowedHosts: true,
      proxy: {
        "/ws": {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
