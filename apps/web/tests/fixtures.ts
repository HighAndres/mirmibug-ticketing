/**
 * Datos fijos compartidos entre tests/global-setup.ts (que los inserta) y los
 * tests de integración (que los consultan). Ids explícitos para poder
 * referenciarlos sin consultar la BD.
 */
import { hashApiKey } from "@/lib/integrations/auth";

export const API_KEYS = {
  /** Todos los scopes */
  full: "mbk_test-full-scopes-key-000000000000000000000000",
  /** Solo tickets:read */
  readOnly: "mbk_test-read-only-key-00000000000000000000000000",
  /** Revocada */
  revoked: "mbk_test-revoked-key-0000000000000000000000000000",
} as const;

export const API_KEY_HASHES = {
  full: hashApiKey(API_KEYS.full),
  readOnly: hashApiKey(API_KEYS.readOnly),
  revoked: hashApiKey(API_KEYS.revoked),
};

export const CLIENTS = {
  acme: { id: "client-acme", name: "Acme Test", slug: "acme-test", ticketPrefix: "ACM" },
  otra: { id: "client-otra", name: "Otra Empresa", slug: "otra-empresa", ticketPrefix: "OTR" },
} as const;

export const CATEGORIES = {
  soporte: { id: "cat-soporte", name: "Soporte técnico" },
  otra: { id: "cat-otra", name: "Infraestructura y redes" },
} as const;

export const USERS = {
  /** CLIENT_USER de Acme, verificado y con opt-in */
  clientUser: {
    id: "user-client",
    name: "Carla Cliente",
    email: "cliente@acme.test",
    role: "CLIENT_USER",
    clientId: CLIENTS.acme.id,
    phone: "+525511111111",
    verified: true,
    optIn: true,
  },
  /** CLIENT_ADMIN de Acme, verificado */
  clientAdmin: {
    id: "user-admin",
    name: "Andrés Admin",
    email: "admin@acme.test",
    role: "CLIENT_ADMIN",
    clientId: CLIENTS.acme.id,
    phone: "+525522222222",
    verified: true,
    optIn: true,
  },
  /** CLIENT_USER de Acme con teléfono pero SIN verificar */
  unverified: {
    id: "user-unverified",
    name: "Nora Nueva",
    email: "nuevo@acme.test",
    role: "CLIENT_USER",
    clientId: CLIENTS.acme.id,
    phone: "+525533333333",
    verified: false,
    optIn: false,
  },
  /** CLIENT_USER de otra empresa, verificado pero SIN opt-in (no recibe eventos) */
  outsider: {
    id: "user-outsider",
    name: "Omar Otro",
    email: "user@otra.test",
    role: "CLIENT_USER",
    clientId: CLIENTS.otra.id,
    phone: "+525544444444",
    verified: true,
    optIn: false,
  },
  /** Usuario desactivado, verificado */
  inactive: {
    id: "user-inactive",
    name: "Beatriz Baja",
    email: "baja@acme.test",
    role: "CLIENT_USER",
    clientId: CLIENTS.acme.id,
    phone: "+525555555555",
    verified: true,
    optIn: true,
  },
  /** AGENT global con acceso a Acme vía UserClient, sin WhatsApp */
  agent: {
    id: "user-agent",
    name: "Tomás Técnico",
    email: "agente@test.local",
    role: "AGENT",
    clientId: null,
    phone: null,
    verified: false,
    optIn: false,
  },
} as const;

export const TICKETS = {
  /** Acme, de clientUser, OPEN */
  open: { id: "ticket-open", folio: "ACM-0001", title: "La impresora no imprime" },
  /** Acme, de clientUser, PENDING (esperando al cliente), asignado al agente */
  pending: { id: "ticket-pending", folio: "ACM-0002", title: "Correo no sincroniza" },
  /** Acme, de clientAdmin (otro usuario de la misma empresa), OPEN */
  adminOwned: { id: "ticket-admin", folio: "ACM-0003", title: "Acceso a la VPN" },
  /** Acme, de clientUser, CLOSED hace 1 día */
  closedRecent: { id: "ticket-closed-recent", folio: "ACM-0004", title: "Teclado dañado" },
  /** Acme, de clientUser, CLOSED hace 30 días */
  closedOld: { id: "ticket-closed-old", folio: "ACM-0005", title: "Monitor parpadea" },
  /** Acme, de clientUser, RESOLVED */
  resolved: { id: "ticket-resolved", folio: "ACM-0006", title: "Instalar Office" },
  /** Otra empresa, de outsider, OPEN */
  otherCompany: { id: "ticket-other", folio: "OTR-0001", title: "Servidor caído" },
} as const;

/** Entrada "cruda" tal como la mandaría Meta para el clientUser (sin + y con 1) */
export const RAW_PHONES = {
  clientUserMeta: "5215511111111",
  clientUserPretty: "55 1111 1111",
} as const;
