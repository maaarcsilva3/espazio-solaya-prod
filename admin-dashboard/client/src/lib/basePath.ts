/** Vite `base` always ends with `/` (e.g. `/` or `/dev/espazio-admin/`). */
export const BASE_URL = import.meta.env.BASE_URL || '/';

/** Router basename without trailing slash (`''` when served at domain root). */
export const ROUTER_BASENAME = BASE_URL.replace(/\/$/, '') || undefined;
