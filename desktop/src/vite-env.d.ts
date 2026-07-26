/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OMNIROUTE_BASE_URL?: string;
  readonly VITE_OMNIROUTE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
