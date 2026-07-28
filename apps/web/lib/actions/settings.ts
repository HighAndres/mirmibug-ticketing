"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { encryptSecret } from "@/lib/crypto";
import { clearEmailConfigCache, SETTINGS_ID } from "@/lib/email-settings";
import { sendTestMail } from "@/lib/mailer";

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");
  if (session.user.roleKey !== "SUPERADMIN") throw new Error("Sin permisos");
  return session.user;
}

// ---------------------------------------------------------------------------
// Guardar configuración de correo
// ---------------------------------------------------------------------------
export async function updateEmailSettings(formData: FormData) {
  const user = await requireSuperadmin();

  const host = (formData.get("smtpHost") as string)?.trim() || null;
  const portRaw = (formData.get("smtpPort") as string)?.trim();
  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const smtpUser = (formData.get("smtpUser") as string)?.trim() || null;
  const from = (formData.get("smtpFrom") as string)?.trim() || null;
  const secure = formData.get("smtpSecure") === "on";
  const enabled = formData.get("enabled") === "on";
  const newPassword = (formData.get("smtpPass") as string) ?? "";

  if (portRaw && (Number.isNaN(port) || port < 1 || port > 65535)) {
    throw new Error("Puerto SMTP inválido");
  }

  const toggles = {
    onTicketCreated: formData.get("onTicketCreated") === "on",
    onTicketAssigned: formData.get("onTicketAssigned") === "on",
    onStatusChanged: formData.get("onStatusChanged") === "on",
    onNewComment: formData.get("onNewComment") === "on",
    onCollaboratorAdded: formData.get("onCollaboratorAdded") === "on",
  };

  // La contraseña solo se actualiza si el campo viene con valor (write-only).
  // Vacío = conservar la existente.
  const passUpdate = newPassword ? { smtpPass: encryptSecret(newPassword) } : {};

  const base = {
    enabled,
    smtpHost: host,
    smtpPort: port,
    smtpUser,
    smtpFrom: from,
    smtpSecure: secure,
    ...toggles,
    updatedById: user.id,
  };

  await prisma.emailSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...base, ...passUpdate },
    update: { ...base, ...passUpdate },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "EmailSettings",
      entityId: SETTINGS_ID,
      description: `Configuración de correo actualizada (enabled=${enabled}, host=${host ?? "—"})`,
      actorId: user.id,
      metadataJson: JSON.stringify({ enabled, host, port, secure, passwordChanged: !!newPassword, toggles }),
    },
  });

  clearEmailConfigCache();
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// Enviar correo de prueba (para useActionState en la UI)
// ---------------------------------------------------------------------------
export async function sendTestEmail(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  await requireSuperadmin();

  const to = (formData.get("to") as string)?.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, message: "Ingresa un correo de destino válido." };
  }

  clearEmailConfigCache();
  return sendTestMail(to);
}
