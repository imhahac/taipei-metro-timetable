/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TDX_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
