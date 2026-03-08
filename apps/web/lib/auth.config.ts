import type { NextAuthConfig } from "next-auth";

// ---------------------------------------------------------------------------
// Rutas públicas (no requieren sesión)
// ---------------------------------------------------------------------------
const PUBLIC_PATHS = ["/login"];

// ---------------------------------------------------------------------------
// Configuración base de Auth.js — sin imports de Node.js
// Esta parte es compatible con el edge runtime (middleware/proxy).
// La lógica de Prisma y bcrypt vive en lib/auth.ts.
// ---------------------------------------------------------------------------
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [],

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Rutas públicas: si ya tiene sesión, redirige al dashboard
      if (PUBLIC_PATHS.includes(pathname)) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Rutas de API de auth: siempre permitir
      if (pathname.startsWith("/api/auth")) {
        return true;
      }

      // Sin sesión → redirige al login
      if (!isLoggedIn) {
        return false;
      }

      return true;
    },

    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleKey = (user as { roleKey: string }).roleKey;
        token.roleName = (user as { roleName: string }).roleName;
        token.clientId = (user as { clientId: string | null }).clientId;
        token.clientName = (user as { clientName: string | null }).clientName;
        token.clientSlug = (user as { clientSlug: string | null }).clientSlug;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.roleKey = token.roleKey as string;
      session.user.roleName = token.roleName as string;
      session.user.clientId = token.clientId as string | null;
      session.user.clientName = token.clientName as string | null;
      session.user.clientSlug = token.clientSlug as string | null;
      return session;
    },
  },
};
