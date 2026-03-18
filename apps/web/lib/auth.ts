import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

// ---------------------------------------------------------------------------
// Extensión de tipos de NextAuth para incluir datos del dominio
// ---------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleKey: string;
      roleName: string;
      clientId: string | null;
      clientName: string | null;
      clientSlug: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    roleKey: string;
    roleName: string;
    clientId: string | null;
    clientName: string | null;
    clientSlug: string | null;
  }
}

// ---------------------------------------------------------------------------
// Constantes de seguridad
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Configuración completa — extiende authConfig con Credentials + Prisma
// ---------------------------------------------------------------------------
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      // Primera vez (login): enriquecer token con datos del usuario
      if (user) {
        token.id = user.id;
        token.roleKey = (user as { roleKey: string }).roleKey;
        token.roleName = (user as { roleName: string }).roleName;
        token.clientId = (user as { clientId: string | null }).clientId;
        token.clientName = (user as { clientName: string | null }).clientName;
        token.clientSlug = (user as { clientSlug: string | null }).clientSlug;
        token.issuedAt = Date.now();
      }

      // Verificar invalidación de sesión (cada request)
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isActive: true, tokenInvalidatedAt: true },
        });

        // Si el usuario fue desactivado o no existe, invalidar token
        if (!dbUser || !dbUser.isActive) {
          return { ...token, invalidated: true };
        }

        // Si el token fue emitido antes de tokenInvalidatedAt, invalidar
        if (
          dbUser.tokenInvalidatedAt &&
          typeof token.issuedAt === "number" &&
          token.issuedAt < dbUser.tokenInvalidatedAt.getTime()
        ) {
          return { ...token, invalidated: true };
        }
      }

      return token;
    },

    session({ session, token }) {
      // Si el token fue invalidado, devolver sesión sin usuario
      if (token.invalidated) {
        return { ...session, user: undefined as unknown as typeof session.user, invalidated: true };
      }

      session.user.id = token.id as string;
      session.user.roleKey = token.roleKey as string;
      session.user.roleName = token.roleName as string;
      session.user.clientId = token.clientId as string | null;
      session.user.clientName = token.clientName as string | null;
      session.user.clientSlug = token.clientSlug as string | null;
      return session;
    },
  },

  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },

      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { role: true, client: true },
        });

        if (!user || !user.isActive) return null;

        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const passwordValid = await bcrypt.compare(password, user.password);

        if (!passwordValid) {
          const newAttempts = user.failedLoginAttempts + 1;
          const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newAttempts,
              ...(shouldLock && {
                lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
              }),
            },
          });

          await prisma.auditLog.create({
            data: {
              action: "LOGIN",
              entityType: "User",
              entityId: user.id,
              description: shouldLock
                ? `Cuenta bloqueada tras ${newAttempts} intentos fallidos.`
                : `Intento de login fallido (${newAttempts}/${MAX_FAILED_ATTEMPTS}).`,
              actorId: user.id,
              metadataJson: JSON.stringify({ email, attempts: newAttempts }),
            },
          });

          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        await prisma.auditLog.create({
          data: {
            action: "LOGIN",
            entityType: "User",
            entityId: user.id,
            description: "Login exitoso.",
            actorId: user.id,
            metadataJson: JSON.stringify({ email }),
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleKey: user.role.key,
          roleName: user.role.name,
          clientId: user.clientId,
          clientName: user.client?.name ?? null,
          clientSlug: user.client?.slug ?? null,
        };
      },
    }),
  ],
});
