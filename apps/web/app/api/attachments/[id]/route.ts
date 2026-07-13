import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTicket, getUserClientIds } from "@/lib/permissions";
import { getPublicPath } from "@/lib/uploads";
import fs from "fs/promises";
import path from "path";

function getUploadDir() {
  return getPublicPath("uploads", "attachments");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const { user } = session;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      ticket: { select: { clientId: true, requesterId: true } },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  // Verificar acceso al ticket del adjunto (incluye agentes multi-cliente)
  const agentClientIds =
    user.roleKey === "AGENT"
      ? await getUserClientIds(user.id, user.roleKey, user.clientId)
      : undefined;
  if (!canAccessTicket(user, attachment.ticket, agentClientIds)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const filePath = path.join(getUploadDir(), attachment.storedName);

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Content-Length": String(attachment.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en disco" }, { status: 404 });
  }
}
