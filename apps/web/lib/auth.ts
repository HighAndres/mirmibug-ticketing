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
