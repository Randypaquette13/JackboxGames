/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_BASE_URL?: string;
  readonly VITE_WS_PROXY_TARGET?: string;
  /** When `"true"`, host page shows keyboard dev controllers (`npm run dev` only). */
  readonly VITE_ENABLE_DEV_CONTROLLERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
