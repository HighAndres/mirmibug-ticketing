/**
 * Contactos de WhatsApp = usuarios (User) con whatsappPhone.
 *
 * Reglas de autorización por teléfono: el remitente solo ve o modifica los
 * tickets que vería en la web con su rol (lib/permissions.canAccessTicket).
 * Cuando no tiene acceso se responde 404, nunca 403, para no revelar que el
 * ticket existe. 403 se reserva para CONTACT_NOT_VERIFIED.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessTicket, getUserClientIds } from "@/lib/permissions";
import { integrationErrors } from "./http";
import { normalizePhone } from "./phone";

export type Contact = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleKey: string;
  clientId: string | null;
  client: { id: string; name: string; slug: string } | null;
  whatsappPhone: string | null;
  whatsappOptIn: boolean;
  whatsappVerifiedAt: Date | null;
};

const contactSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  clientId: true,
  whatsappPhone: true,
  whatsappOptIn: true,
  whatsappVerifiedAt: true,
  role: { select: { key: true } },
  client: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

type ContactRow = Prisma.UserGetPayload<{ select: typeof contactSelect }>;

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    roleKey: row.role.key,
    clientId: row.clientId,
    client: row.client,
    whatsappPhone: row.whatsappPhone,
    whatsappOptIn: row.whatsappOptIn,
    whatsappVerifiedAt: row.whatsappVerifiedAt,
  };
}

/** Busca por teléfono (se normaliza antes; lanza PhoneValidationError si es inválido). */
export async function findContactByPhone(rawPhone: string): Promise<Contact | null> {
  const phone = normalizePhone(rawPhone);
  const row = await prisma.user.findUnique({ where: { whatsappPhone: phone }, select: contactSelect });
  return row ? toContact(row) : null;
}

export async function findContactById(id: string): Promise<Contact | null> {
  const row = await prisma.user.findUnique({ where: { id }, select: contactSelect });
  return row ? toContact(row) : null;
}

/** Contacto activo (404 si no) y verificado (403 CONTACT_NOT_VERIFIED si no). */
export function assertContactUsable(contact: Contact | null): asserts contact is Contact {
  if (!contact || !contact.isActive) {
    throw integrationErrors.notFound("No hay un contacto con ese número de WhatsApp.");
  }
  if (!contact.whatsappVerifiedAt) {
    throw integrationErrors.contactNotVerified();
  }
}

export async function requireVerifiedContact(rawPhone: string): Promise<Contact> {
  const contact = await findContactByPhone(rawPhone);
  assertContactUsable(contact);
  return contact;
}

async function agentClientIds(contact: Contact): Promise<string[] | undefined> {
  if (contact.roleKey !== "AGENT") return undefined;
  return getUserClientIds(contact.id, contact.roleKey, contact.clientId);
}

/** Mismas reglas que la UI, incluyendo colaboradores explícitos del ticket. */
export async function contactCanAccessTicket(
  contact: Contact,
  ticket: { id: string; clientId: string; requesterId: string }
): Promise<boolean> {
  const [clientIds, collaborator] = await Promise.all([
    agentClientIds(contact),
    prisma.ticketCollaborator.findUnique({
      where: { ticketId_userId: { ticketId: ticket.id, userId: contact.id } },
      select: { id: true },
    }),
  ]);
  return canAccessTicket(
    { id: contact.id, roleKey: contact.roleKey, clientId: contact.clientId },
    ticket,
    clientIds,
    collaborator ? [contact.id] : []
  );
}

/** Filtro de tickets visibles para el contacto (para listados). */
export async function ticketWhereForContact(contact: Contact): Promise<Prisma.TicketWhereInput> {
  switch (contact.roleKey) {
    case "SUPERADMIN":
      return {};
    case "AGENT": {
      const ids = (await agentClientIds(contact)) ?? [];
      if (contact.clientId) ids.push(contact.clientId);
      return { clientId: { in: ids } };
    }
    case "CLIENT_ADMIN":
    case "CLIENT_SUPERVISOR":
      return contact.clientId ? { clientId: contact.clientId } : { id: "__none__" };
    default:
      // CLIENT_USER: propios o donde colabora
      return {
        OR: [{ requesterId: contact.id }, { collaborators: { some: { userId: contact.id } } }],
      };
  }
}

export function serializeContact(contact: Contact) {
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    role: contact.roleKey,
    is_active: contact.isActive,
    whatsapp_phone: contact.whatsappPhone,
    opt_in: contact.whatsappOptIn,
    verified: contact.whatsappVerifiedAt !== null,
    verified_at: contact.whatsappVerifiedAt?.toISOString() ?? null,
    client: contact.client ? { id: contact.client.id, name: contact.client.name, slug: contact.client.slug } : null,
  };
}
