import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTicket, getUserClientIds } from "@/lib/permissions";
import { getPublicPath } from "@/lib/uploads";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_REQUEST = 5;

function getUploadDir() {
  return getPublicPath("uploads", "attachments");
}

// POST: subir archivos a un ticket
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { user } = session;

  const formData = await req.formData();
  const ticketId = formData.get("ticketId") as string;
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId requerido" }, { status: 400 });
  }

  // Verificar acceso al ticket
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, requesterId: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }
  const agentClientIds =
    user.roleKey === "AGENT"
      ? await getUserClientIds(user.id, user.roleKey, user.clientId)
      : undefined;
  if (!canAccessTicket(user, ticket, agentClientIds)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No se enviaron archivos" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES_PER_REQUEST} archivos por envío` },
      { status: 400 }
    );
  }

  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });

  const created = [];

  for (const file of files) {
    if (file.size === 0) continue;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `"${file.name}" excede el límite de 10 MB` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido: "${file.name}" (${file.type})` },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const hash = crypto.randomBytes(16).toString("hex");
    const storedName = `${hash}.${ext}`;

    const bytes = await file.arrayBuffer();
    await fs.writeFile(path.join(uploadDir, storedName), Buffer.from(bytes));

    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        storedName,
        mimeType: file.type,
        size: file.size,
        ticketId,
        uploadedById: user.id,
      },
    });

    created.push({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  }

  return NextResponse.json({ attachments: created });
}
