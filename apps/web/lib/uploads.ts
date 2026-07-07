import path from "path";

/**
 * Directorio raíz de la app (donde vive /public).
 * En producción definir APP_DIR; como fallback se usa el CWD del proceso,
 * que en `next start` es la raíz de la app.
 */
export function getAppDir(): string {
  return process.env.APP_DIR ?? process.cwd();
}

/** Resuelve una ruta dentro de /public (ej. getPublicPath("uploads", "logos")). */
export function getPublicPath(...segments: string[]): string {
  return path.join(getAppDir(), "public", ...segments);
}
