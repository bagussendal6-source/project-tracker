import type { Api } from "../src/core/api-types.ts";

declare global {
  interface Window {
    api: Api;
  }
}

/** Resolves window.api lazily so main.tsx can install the dev mock before first use. */
export const api: Api = new Proxy({} as Api, {
  get: (_t, key) => window.api[key as keyof Api],
});
