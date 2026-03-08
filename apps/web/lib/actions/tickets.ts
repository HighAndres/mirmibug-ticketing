"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateFolio } from "@/lib/tickets";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Crear ticket
// ---------------------------------------------------------------------------
export async function createTicket(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("No autenticado");

  const { user } = session;

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const priority = formData.get("priority") as string;
  const categoryId = formData.get("categoryId") as string;

  if (!title?.trim() || !description?.trim() || !categoryId) {
    throw new Error("Campos requeridos incompletos");
  }

  // El clientId viene de la sesión (o lo elige el SUPERADMIN en el form)
  const clientId =
    user.roleKey === "SUPERADMIN"
      ? (formData.get("clientId") as string)
      : user.clientId!;

  if (!clientId) throw new Error("Cliente requerido");

  const folio = await generateFolio();

  const ticket = await prisma.ticket.create({
    data: {
      folio,
      title: title.trim(),
      description: description.trim(),
      priority: (priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM",
      status: "OPEN",
      requesterId: user.id,
      categoryId,
      clientId,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "Ticket",
      entityId: ticket.id,
      description: `Ticket ${folio} creado: "${title}"`,
      actorId: user.id,
      metadataJson: JSON.stringify({ folio, clientId, categoryId }),
    },
  });

  redirect(`/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Cambiar estatus
// ---------------------------------------------------------------------------
export async function changeTicketStatus(ticketId: string, status: string) {
  const session = await auth();
  if (!session) throw new Error("No autenticado");

  const { user } = session;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, status: true, folio: true },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  // CLIENT_USER solo puede cerrar sus propios tickets
  if (
    user.roleKey === "CLIENT_USER" &&
    !["CLOSED"].includes(status)
  ) {
    throw new Error("Sin permisos para cambiar estatus");
  }

  // Multitenencia: cliente no puede tocar tickets de otro cliente
  if (
    user.roleKey !== "SUPERADMIN" &&
    user.clientId !== ticket.clientId
  ) {
    throw new Error("Sin permisos para este ticket");
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: status as "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "Ticket",
      entityId: ticketId,
      description: `Estatus de ${ticket.folio} cambiado a ${status}`,
      actorId: user.id,
      metadataJson: JSON.stringify({ from: ticket.status, to: status }),
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

// ---------------------------------------------------------------------------
// Asignar agente
// ---------------------------------------------------------------------------
export async function assignTicket(ticketId: string, assigneeId: string | null) {
  const session = await auth();
  if (!session) throw new Error("No autenticado");

  const { user } = session;

  if (!["SUPERADMIN", "CLIENT_ADMIN", "AGENT"].includes(user.roleKey)) {
    throw new Error("Sin permisos para asignar tickets");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { folio: true, clientId: true },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  if (user.roleKey !== "SUPERADMIN" && user.clientId !== ticket.clientId) {
    throw new Error("Sin permisos para este ticket");
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId: assigneeId || null,
      status: assigneeId ? "IN_PROGRESS" : "OPEN",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "ASSIGN",
      entityType: "Ticket",
      entityId: ticketId,
      description: assigneeId
        ? `Ticket ${ticket.folio} asignado`
        : `Ticket ${ticket.folio} desasignado`,
      actorId: user.id,
      metadataJson: JSON.stringify({ assigneeId }),
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
}

// ---------------------------------------------------------------------------
// Agregar comentario
// ---------------------------------------------------------------------------
export async function addComment(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("No autenticado");

  const { user } = session;

  const ticketId = formData.get("ticketId") as string;
  const content = formData.get("content") as string;
  const isInternalRaw = formData.get("isInternal") as string | null;
  const isInternal = isInternalRaw === "true";

  if (!content?.trim()) return;

  // Solo agentes/admins pueden hacer notas internas
  if (isInternal && user.roleKey === "CLIENT_USER") {
    throw new Error("Sin permisos para notas internas");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, folio: true },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  if (user.roleKey !== "SUPERADMIN" && user.clientId !== ticket.clientId) {
    throw new Error("Sin permisos para este ticket");
  }

  await prisma.comment.create({
    data: {
      content: content.trim(),
      isInternal,
      ticketId,
      authorId: user.id,
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
}
