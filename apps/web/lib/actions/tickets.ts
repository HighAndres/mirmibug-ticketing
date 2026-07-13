"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateFolio } from "@/lib/tickets";
import {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyStatusChanged,
  notifyNewComment,
} from "@/lib/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canModifyTicket, canManageTickets, canWriteInternalNotes, isSameTenant, isSameTenantAsync, getUserClientIds } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Crear ticket
// ---------------------------------------------------------------------------
export async function createTicket(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const priority = formData.get("priority") as string;
  const categoryId = formData.get("categoryId") as string;
  const subcategoryId = (formData.get("subcategoryId") as string) || null;

  if (!title?.trim() || !description?.trim() || !categoryId) {
    throw new Error("Campos requeridos incompletos");
  }

  // El clientId viene de la sesión, o lo elige el SUPERADMIN/AGENT multi-cliente en el form
  let clientId: string;
  if (user.roleKey === "SUPERADMIN") {
    clientId = formData.get("clientId") as string;
  } else if (user.roleKey === "AGENT" && !user.clientId) {
    // Agente multi-cliente: debe elegir el cliente desde el form
    clientId = formData.get("clientId") as string;
  } else {
    clientId = user.clientId!;
  }

  if (!clientId) throw new Error("Cliente requerido");

  // La categoría (y subcategoría) deben pertenecer al cliente del ticket
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { clientId: true },
  });
  if (!category || category.clientId !== clientId) {
    throw new Error("Categoría no válida para este cliente");
  }
  if (subcategoryId) {
    const sub = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: { categoryId: true },
    });
    if (!sub || sub.categoryId !== categoryId) {
      throw new Error("Subcategoría no válida para esta categoría");
    }
  }

  // Crear con reintento: dos creaciones simultáneas pueden calcular el mismo
  // folio y chocar con el unique; se regenera y reintenta.
  let ticket;
  for (let attempt = 0; ; attempt++) {
    const folio = await generateFolio(clientId);
    try {
      ticket = await prisma.ticket.create({
        data: {
          folio,
          title: title.trim(),
          description: description.trim(),
          priority: (priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM",
          status: "OPEN",
          requesterId: user.id,
          categoryId,
          subcategoryId,
          clientId,
        },
      });
      break;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw err;
    }
  }

  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Ticket",
        entityId: ticket.id,
        description: `Ticket ${ticket.folio} creado: "${title}"`,
        actorId: user.id,
        metadataJson: JSON.stringify({ folio: ticket.folio, clientId, categoryId }),
      },
    }),
    prisma.ticketActivity.create({
      data: {
        type: "CREATED",
        ticketId: ticket.id,
        actorId: user.id,
      },
    }),
  ]);

  // Email: notificar al solicitante
  notifyTicketCreated(user.email ?? "", user.name ?? "", ticket).catch(console.error);

  redirect(`/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Cambiar estatus
// ---------------------------------------------------------------------------
export async function changeTicketStatus(ticketId: string, status: string) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      clientId: true,
      status: true,
      folio: true,
      title: true,
      priority: true,
      requesterId: true,
      requester: { select: { id: true, email: true, name: true } },
      assignee: { select: { id: true, email: true, name: true } },
    },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Estatus no válido");
  }

  // Autorización: CLIENT_USER solo puede cerrar SUS PROPIOS tickets
  if (user.roleKey === "CLIENT_USER") {
    if (ticket.requesterId !== user.id) {
      throw new Error("Sin permisos para este ticket");
    }
    if (status !== "CLOSED") {
      throw new Error("Sin permisos para cambiar estatus");
    }
  }

  // Multitenencia: verificar mismo tenant (async para agentes multi-cliente)
  if (!(await isSameTenantAsync(user, ticket.clientId))) {
    throw new Error("Sin permisos para este ticket");
  }

  const previousStatus = ticket.status;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: status as "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticketId,
        description: `Estatus de ${ticket.folio} cambiado a ${status}`,
        actorId: user.id,
        metadataJson: JSON.stringify({ from: previousStatus, to: status }),
      },
    }),
    prisma.ticketActivity.create({
      data: {
        type: "STATUS_CHANGE",
        field: "status",
        oldValue: previousStatus,
        newValue: status,
        ticketId,
        actorId: user.id,
      },
    }),
  ]);

  // Email: notificar al solicitante y al asignado
  notifyStatusChanged(
    { id: ticketId, folio: ticket.folio, title: ticket.title, status, priority: ticket.priority },
    previousStatus,
    ticket.requester.email,
    ticket.requester.name,
    ticket.assignee?.email,
    ticket.assignee?.name
  ).catch(console.error);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

// ---------------------------------------------------------------------------
// Asignar agente
// ---------------------------------------------------------------------------
export async function assignTicket(ticketId: string, assigneeId: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  if (!canManageTickets(user.roleKey)) {
    throw new Error("Sin permisos para asignar tickets");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      folio: true,
      title: true,
      clientId: true,
      priority: true,
      status: true,
      requester: { select: { name: true } },
    },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  if (!(await isSameTenantAsync(user, ticket.clientId))) {
    throw new Error("Sin permisos para este ticket");
  }

  // El asignado debe ser un rol de gestión activo con acceso al tenant del ticket
  if (assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: {
        clientId: true,
        isActive: true,
        role: { select: { key: true } },
        userClients: { select: { clientId: true } },
      },
    });
    if (!assignee || !assignee.isActive) {
      throw new Error("Usuario asignado no válido");
    }
    if (!canManageTickets(assignee.role.key)) {
      throw new Error("Solo se pueden asignar tickets a agentes o administradores");
    }
    const assigneeClientIds = assignee.userClients.map((uc: { clientId: string }) => uc.clientId);
    if (
      !isSameTenant(
        { id: assigneeId, roleKey: assignee.role.key, clientId: assignee.clientId },
        ticket.clientId,
        assigneeClientIds
      )
    ) {
      throw new Error("El usuario asignado no tiene acceso a este cliente");
    }
  }

  // Obtener asignado anterior para el timeline
  const previousAssigneeId = (await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { assigneeId: true },
  }))?.assigneeId ?? null;

  // Obtener nombre del nuevo asignado si existe
  const newAssigneeName = assigneeId
    ? (await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }))?.name ?? null
    : null;
  const previousAssigneeName = previousAssigneeId
    ? (await prisma.user.findUnique({ where: { id: previousAssigneeId }, select: { name: true } }))?.name ?? null
    : null;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId: assigneeId || null,
      status: assigneeId ? "IN_PROGRESS" : "OPEN",
    },
  });

  await Promise.all([
    prisma.auditLog.create({
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
    }),
    prisma.ticketActivity.create({
      data: {
        type: "ASSIGNMENT",
        field: "assigneeId",
        oldValue: previousAssigneeName ?? null,
        newValue: newAssigneeName ?? null,
        ticketId,
        actorId: user.id,
      },
    }),
  ]);

  // Email: notificar al nuevo asignado
  if (assigneeId) {
    prisma.user.findUnique({ where: { id: assigneeId }, select: { email: true, name: true } })
      .then((assignee: { email: string; name: string | null } | null) => {
        if (assignee) {
          notifyTicketAssigned(
            assignee.email,
            assignee.name ?? "Usuario",
            { id: ticketId, folio: ticket.folio, title: ticket.title, status: "IN_PROGRESS", priority: ticket.priority },
            ticket.requester.name
          ).catch(console.error);
        }
      })
      .catch(console.error);
  }

  revalidatePath(`/tickets/${ticketId}`);
}

// ---------------------------------------------------------------------------
// Cambiar prioridad (solo SUPERADMIN, CLIENT_ADMIN, AGENT)
// ---------------------------------------------------------------------------
export async function changeTicketPriority(ticketId: string, newPriority: string) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  if (!canManageTickets(user.roleKey)) {
    throw new Error("Sin permisos para cambiar la prioridad");
  }

  const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
  if (!validPriorities.includes(newPriority)) {
    throw new Error("Prioridad no válida");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, priority: true, folio: true },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  if (!(await isSameTenantAsync(user, ticket.clientId))) {
    throw new Error("Sin permisos para este ticket");
  }

  const previousPriority = ticket.priority;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      priority: newPriority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      priorityValidated: true,
      priorityValidatedById: user.id,
      priorityValidatedAt: new Date(),
    },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticketId,
        description: `Prioridad de ${ticket.folio} cambiada de ${previousPriority} a ${newPriority}`,
        actorId: user.id,
        metadataJson: JSON.stringify({ field: "priority", from: previousPriority, to: newPriority }),
      },
    }),
    prisma.ticketActivity.create({
      data: {
        type: "PRIORITY_CHANGE",
        field: "priority",
        oldValue: previousPriority,
        newValue: newPriority,
        ticketId,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

// ---------------------------------------------------------------------------
// Validar prioridad (confirmar que la prioridad actual es correcta)
// ---------------------------------------------------------------------------
export async function validateTicketPriority(ticketId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  if (!canManageTickets(user.roleKey)) {
    throw new Error("Sin permisos para validar la prioridad");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { clientId: true, folio: true, priority: true },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  if (!(await isSameTenantAsync(user, ticket.clientId))) {
    throw new Error("Sin permisos para este ticket");
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      priorityValidated: true,
      priorityValidatedById: user.id,
      priorityValidatedAt: new Date(),
    },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticketId,
        description: `Prioridad "${ticket.priority}" de ${ticket.folio} validada`,
        actorId: user.id,
        metadataJson: JSON.stringify({ field: "priorityValidation", priority: ticket.priority }),
      },
    }),
    prisma.ticketActivity.create({
      data: {
        type: "PRIORITY_VALIDATION",
        field: "priority",
        newValue: ticket.priority,
        ticketId,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

// ---------------------------------------------------------------------------
// Agregar comentario
// ---------------------------------------------------------------------------
export async function addComment(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");

  const { user } = session;

  const ticketId = formData.get("ticketId") as string;
  const content = formData.get("content") as string;
  const isInternalRaw = formData.get("isInternal") as string | null;
  const isInternal = isInternalRaw === "true";

  if (!content?.trim()) return;

  // Solo agentes/admins pueden hacer notas internas
  if (isInternal && !canWriteInternalNotes(user.roleKey)) {
    throw new Error("Sin permisos para notas internas");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      clientId: true,
      requesterId: true,
      folio: true,
      title: true,
      status: true,
      priority: true,
      requester: { select: { id: true, email: true, name: true } },
      assignee: { select: { id: true, email: true, name: true } },
    },
  });

  if (!ticket) throw new Error("Ticket no encontrado");

  // Autorización: verificar acceso multi-tenant
  if (user.roleKey === "AGENT") {
    const agentClientIds = await getUserClientIds(user.id, user.roleKey, user.clientId);
    if (!canModifyTicket(user, ticket, agentClientIds)) {
      throw new Error("Sin permisos para este ticket");
    }
  } else if (!canModifyTicket(user, ticket)) {
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

  // Email: solo comentarios públicos notifican al solicitante y asignado
  if (!isInternal) {
    notifyNewComment(
      { id: ticketId, folio: ticket.folio, title: ticket.title, status: ticket.status, priority: ticket.priority },
      user.id,
      content.trim(),
      ticket.requester.email,
      ticket.requester.name,
      ticket.requester.id,
      ticket.assignee?.email,
      ticket.assignee?.name,
      ticket.assignee?.id
    ).catch(console.error);
  }

  revalidatePath(`/tickets/${ticketId}`);
}
