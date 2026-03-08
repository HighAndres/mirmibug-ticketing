import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// ---------------------------------------------------------------------------
// Proxy (middleware en Next.js 16+)
// Usa solo authConfig — edge-compatible, sin imports de Node.js.
// La lógica de autorización vive en authConfig.callbacks.authorized
// ---------------------------------------------------------------------------
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas EXCEPTO:
     * - _next/static (archivos estáticos)
     * - _next/image (imágenes optimizadas)
     * - favicon.ico
     * - archivos con extensión (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
