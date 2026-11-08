import "dotenv/config";
import { PrismaClient, TicketPriority, TicketStatus, AuditAction, type Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const permissionsData = [
  { key: "client.create", name: "Crear clientes", description: "Permite crear empresas cliente." },
  { key: "client.read", name: "Ver clientes", description: "Permite consultar empresas cliente." },
  { key: "client.update", name: "Editar clientes", description: "Permite editar empresas cliente." },
  { key: "client.delete", name: "Eliminar clientes", description: "Permite eliminar empresas cliente." },

  { key: "user.create", name: "Crear usuarios", description: "Permite crear usuarios." },
  { key: "user.read", name: "Ver usuarios", description: "Permite consultar usuarios." },
  { key: "user.update", name: "Editar usuarios", description: "Permite editar usuarios." },
  { key: "user.delete", name: "Eliminar usuarios", description: "Permite eliminar usuarios." },
  { key: "user.assign_role", name: "Asignar roles", description: "Permite asignar roles a usuarios." },
  { key: "user.grant_permission", name: "Otorgar permisos", description: "Permite otorgar permisos directos a usuarios." },

  { key: "role.create", name: "Crear roles", description: "Permite crear roles." },
  { key: "role.read", name: "Ver roles", description: "Permite consultar roles." },
  { key: "role.update", name: "Editar roles", description: "Permite editar roles." },
  { key: "role.delete", name: "Eliminar roles", description: "Permite eliminar roles." },
  { key: "role.assign_permission", name: "Asignar permisos a roles", description: "Permite asignar permisos a roles." },

  { key: "ticket.create", name: "Crear tickets", description: "Permite crear tickets." },
  { key: "ticket.read", name: "Ver tickets", description: "Permite consultar tickets." },
  { key: "ticket.update", name: "Editar tickets", description: "Permite editar tickets." },
  { key: "ticket.assign", name: "Asignar tickets", description: "Permite asignar tickets." },
  { key: "ticket.close", name: "Cerrar tickets", description: "Permite cerrar tickets." },

  { key: "category.manage", name: "Gestionar categorías", description: "Permite crear y editar categorías." },
  { key: "report.view", name: "Ver reportes", description: "Permite consultar reportes." },
  { key: "audit.view", name: "Ver auditoría", description: "Permite consultar logs de auditoría." },
  { key: "settings.manage", name: "Gestionar configuración", description: "Permite administrar configuración global." },
];

const roleDefinitions = [
  {
    key: "SUPERADMIN",
    name: "Super Administrador",
    description: "Control total global del sistema.",
    isSystem: true,
    permissions: permissionsData.map((p: (typeof permissionsData)[number]) => p.key),
  },
  {
    key: "CLIENT_ADMIN",
    name: "Administrador de Cliente",
    description: "Administra usuarios y tickets de su empresa.",
    isSystem: true,
    permissions: [
      "user.create",
      "user.read",
      "user.update",
      "ticket.create",
      "ticket.read",
      "ticket.update",
      "ticket.assign",
      "ticket.close",
      "category.manage",
      "report.view",
    ],
  },
  {
    key: "AGENT",
    name: "Agente",
    description: "Opera tickets asignados o permitidos.",
    isSystem: true,
    permissions: [
      "ticket.read",
      "ticket.update",
      "ticket.assign",
      "ticket.close",
      "report.view",
    ],
  },
  {
    key: "CLIENT_SUPERVISOR",
    name: "Supervisor de Cliente",
    description: "Supervisa tickets y reportes de su empresa sin gestionar usuarios.",
    isSystem: true,
    permissions: [
      "ticket.read",
      "ticket.update",
      "ticket.assign",
      "ticket.close",
      "report.view",
      "audit.view",
    ],
  },
  {
    key: "CLIENT_USER",
    name: "Usuario Cliente",
    description: "Usuario final del cliente.",
    isSystem: true,
    permissions: [
      "ticket.create",
      "ticket.read",
    ],
  },
];

// ---------------------------------------------------------------------------
// Contraseñas del seed
//
// Nunca se escriben en el código. Cada una se toma de una variable de entorno
// (SEED_*_PASSWORD) y, si no está definida, se genera una aleatoria que se
// imprime UNA sola vez al final. El upsert no toca la contraseña de cuentas
// que ya existen, así que re-ejecutar el seed no las reinicia.
// ---------------------------------------------------------------------------
const generatedPasswords: Record<string, string> = {};

async function seedPassword(envKey: string, email: string): Promise<string> {
  let plain = process.env[envKey]?.trim();
  if (!plain) {
    plain = crypto.randomBytes(12).toString("base64url");
    generatedPasswords[email] = plain;
  }
  return bcrypt.hash(plain, 10);
}

async function main() {
  // Guard: el seed crea cuentas de demostración; en producción solo debe
  // correr de forma explícita y consciente.
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
    console.error(
      "Seed bloqueado: NODE_ENV=production. Si realmente quieres ejecutarlo, define SEED_ALLOW_PRODUCTION=1 " +
        "y las variables SEED_*_PASSWORD."
    );
    process.exit(1);
  }

  console.log("Iniciando seed seguro...");

  const superPassword = await seedPassword("SEED_ADMIN_PASSWORD", "admin@mirmibug.local");
  const agentPassword = await seedPassword("SEED_AGENT_PASSWORD", "agente@mirmibug.local");
  const clientAdminPassword = await seedPassword("SEED_CLIENT_ADMIN_PASSWORD", "admin@demoindustrial.com");
  const clientUserPassword = await seedPassword("SEED_CLIENT_USER_PASSWORD", "cliente@demoindustrial.com");
  const supervisorPassword = await seedPassword("SEED_SUPERVISOR_PASSWORD", "supervisor@demoindustrial.com");

  // Cuentas que ya existían: su contraseña no cambia, así que no se reporta una generada
  const existingEmails = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: Object.keys(generatedPasswords) } },
        select: { email: true },
      })
    ).map((u: { email: string }) => u.email)
  );
  for (const email of existingEmails) delete generatedPasswords[email];

  const company = await prisma.clientCompany.upsert({
    where: { slug: "demo-industrial" },
    update: {
      isActive: true,
      contactEmail: "soporte@demoindustrial.com",
    },
    create: {
      name: "Demo Industrial SA de CV",
      slug: "demo-industrial",
      isActive: true,
      contactEmail: "soporte@demoindustrial.com",
    },
  });

  for (const permission of permissionsData) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        name: permission.name,
        description: permission.description,
      },
      create: permission,
    });
  }

  for (const roleData of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { key: roleData.key },
      update: {
        name: roleData.name,
        description: roleData.description,
        isSystem: roleData.isSystem,
        isActive: true,
      },
      create: {
        key: roleData.key,
        name: roleData.name,
        description: roleData.description,
        isSystem: roleData.isSystem,
        isActive: true,
      },
    });

    for (const permissionKey of roleData.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { key: permissionKey },
      });

      if (!permission) {
        throw new Error(`No existe el permiso ${permissionKey}`);
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  const superAdminRole = await prisma.role.findUnique({
    where: { key: "SUPERADMIN" },
  });

  const clientAdminRole = await prisma.role.findUnique({
    where: { key: "CLIENT_ADMIN" },
  });

  const agentRole = await prisma.role.findUnique({
    where: { key: "AGENT" },
  });

  const clientSupervisorRole = await prisma.role.findUnique({
    where: { key: "CLIENT_SUPERVISOR" },
  });

  const clientUserRole = await prisma.role.findUnique({
    where: { key: "CLIENT_USER" },
  });

  if (!superAdminRole || !clientAdminRole || !agentRole || !clientSupervisorRole || !clientUserRole) {
    throw new Error("No se pudieron resolver los roles base.");
  }

  const categoriesData = [
    {
      name: "Help Desk",
      description: "Incidentes generales de soporte técnico a usuarios.",
    },
    {
      name: "Infraestructura",
      description: "Servidores, virtualización, almacenamiento y respaldos.",
    },
    {
      name: "Redes",
      description: "Conectividad, switches, routers, WiFi y cableado.",
    },
    {
      name: "Seguridad",
      description: "Antivirus, hardening, accesos, MFA y políticas.",
    },
    {
      name: "Correo y Colaboración",
      description: "Microsoft 365, Google Workspace, correo y calendarios.",
    },
    {
      name: "Aplicaciones y Sistemas",
      description: "ERP, LMS, sistemas web e integraciones.",
    },
    {
      name: "Impresión y Escaneo",
      description: "Impresoras, escáneres, SMB y etiquetado.",
    },
  ];

  const subcategoriesMap: Record<string, string[]> = {
    "Help Desk": ["Reseteo de contraseña", "Acceso a sistemas", "Consulta general"],
    "Infraestructura": ["Servidores", "Virtualización", "Almacenamiento", "Respaldos"],
    "Redes": ["VPN", "Wi-Fi", "Red cableada", "Firewall"],
    "Seguridad": ["Phishing", "Malware", "Acceso no autorizado", "MFA"],
    "Correo y Colaboración": ["Microsoft 365", "Google Workspace", "Calendario"],
    "Aplicaciones y Sistemas": ["ERP", "CRM", "Sistema web"],
    "Impresión y Escaneo": ["Impresora de red", "Escáner", "Tóner/Cartuchos"],
  };

  for (const category of categoriesData) {
    // Catálogo global: las categorías no pertenecen a un cliente
    const cat = await prisma.category.upsert({
      where: { name: category.name },
      update: {
        description: category.description,
      },
      create: {
        name: category.name,
        description: category.description,
      },
    });

    const subs = subcategoriesMap[category.name] ?? [];
    for (const subName of subs) {
      await prisma.subcategory.upsert({
        where: {
          categoryId_name: {
            categoryId: cat.id,
            name: subName,
          },
        },
        update: {},
        create: {
          name: subName,
          categoryId: cat.id,
        },
      });
    }
  }

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@mirmibug.local" },
    update: {
      name: "Super Administrador Mirmibug",
      isActive: true,
      roleId: superAdminRole.id,
      clientId: null,
    },
    create: {
      name: "Super Administrador Mirmibug",
      email: "admin@mirmibug.local",
      password: superPassword,
      isActive: true,
      roleId: superAdminRole.id,
      clientId: null,
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agente@mirmibug.local" },
    update: {
      name: "Agente Soporte",
      isActive: true,
      roleId: agentRole.id,
      clientId: null,
    },
    create: {
      name: "Agente Soporte",
      email: "agente@mirmibug.local",
      password: agentPassword,
      isActive: true,
      roleId: agentRole.id,
      clientId: null,
    },
  });

  const clientAdmin = await prisma.user.upsert({
    where: { email: "admin@demoindustrial.com" },
    update: {
      name: "Administrador Demo Industrial",
      isActive: true,
      roleId: clientAdminRole.id,
      clientId: company.id,
    },
    create: {
      name: "Administrador Demo Industrial",
      email: "admin@demoindustrial.com",
      password: clientAdminPassword,
      isActive: true,
      roleId: clientAdminRole.id,
      clientId: company.id,
    },
  });

  const clientSupervisor = await prisma.user.upsert({
    where: { email: "supervisor@demoindustrial.com" },
    update: {
      name: "Supervisor Demo",
      isActive: true,
      roleId: clientSupervisorRole.id,
      clientId: company.id,
    },
    create: {
      name: "Supervisor Demo",
      email: "supervisor@demoindustrial.com",
      password: supervisorPassword,
      isActive: true,
      roleId: clientSupervisorRole.id,
      clientId: company.id,
    },
  });

  const clientUser = await prisma.user.upsert({
    where: { email: "cliente@demoindustrial.com" },
    update: {
      name: "Cliente Demo",
      isActive: true,
      roleId: clientUserRole.id,
      clientId: company.id,
    },
    create: {
      name: "Cliente Demo",
      email: "cliente@demoindustrial.com",
      password: clientUserPassword,
      isActive: true,
      roleId: clientUserRole.id,
      clientId: company.id,
    },
  });

  // Asignar al agente como multi-cliente de Demo Industrial vía UserClient
  await prisma.userClient.upsert({
    where: {
      userId_clientId: {
        userId: agent.id,
        clientId: company.id,
      },
    },
    update: {},
    create: {
      userId: agent.id,
      clientId: company.id,
    },
  });

  const auditViewPermission = await prisma.permission.findUnique({
    where: { key: "audit.view" },
  });

  if (auditViewPermission) {
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: agent.id,
          permissionId: auditViewPermission.id,
        },
      },
      update: {
        allowed: false,
      },
      create: {
        userId: agent.id,
        permissionId: auditViewPermission.id,
        allowed: false,
      },
    });
  }

  const helpDeskCategory = await prisma.category.findUnique({
    where: { name: "Help Desk" },
  });

  if (!helpDeskCategory) {
    throw new Error("No se encontró la categoría Help Desk");
  }

  const ticket = await prisma.ticket.upsert({
    where: { folio: "MB-0001" },
    update: {
      title: "No puedo conectarme a la VPN",
      description: "El usuario reporta que la conexión VPN falla al intentar acceder desde home office.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      requesterId: clientUser.id,
      assigneeId: agent.id,
      categoryId: helpDeskCategory.id,
      clientId: company.id,
    },
    create: {
      folio: "MB-0001",
      title: "No puedo conectarme a la VPN",
      description: "El usuario reporta que la conexión VPN falla al intentar acceder desde home office.",
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      requesterId: clientUser.id,
      assigneeId: agent.id,
      categoryId: helpDeskCategory.id,
      clientId: company.id,
    },
  });

  const existingComment = await prisma.comment.findFirst({
    where: {
      ticketId: ticket.id,
      authorId: agent.id,
      content: "Ticket recibido. Se revisará configuración del cliente VPN.",
    },
  });

  if (!existingComment) {
    await prisma.comment.create({
      data: {
        content: "Ticket recibido. Se revisará configuración del cliente VPN.",
        ticketId: ticket.id,
        authorId: agent.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: AuditAction.CREATE,
      entityType: "seed",
      entityId: ticket.id,
      description: "Seed inicial de seguridad, roles y permisos aplicado.",
      actorId: superAdmin.id,
      metadataJson: JSON.stringify({
        company: company.slug,
        ticket: "MB-0001",
      }),
    },
  });

  // -------------------------------------------------------------------------
  // Demo de la integración WhatsApp: segunda empresa, tres contactos con
  // WhatsApp verificado, tickets de ejemplo (uno creado "por WhatsApp") y una
  // API key de prueba para n8n. Todo idempotente: no pisa tickets existentes.
  // -------------------------------------------------------------------------
  const company2 = await prisma.clientCompany.upsert({
    where: { slug: "comercial-bajio" },
    update: { isActive: true, ticketPrefix: "CB" },
    create: {
      name: "Comercial del Bajío SA de CV",
      slug: "comercial-bajio",
      isActive: true,
      contactEmail: "sistemas@comercialbajio.com",
      supportPhone: "+524771000000",
      ticketPrefix: "CB",
    },
  });

  const bajioUser = await prisma.user.upsert({
    where: { email: "lucia@comercialbajio.com" },
    update: { name: "Lucía López", isActive: true, roleId: clientUserRole.id, clientId: company2.id },
    create: {
      name: "Lucía López",
      email: "lucia@comercialbajio.com",
      password: clientUserPassword,
      isActive: true,
      roleId: clientUserRole.id,
      clientId: company2.id,
    },
  });

  // El agente también atiende a la segunda empresa
  await prisma.userClient.upsert({
    where: { userId_clientId: { userId: agent.id, clientId: company2.id } },
    update: {},
    create: { userId: agent.id, clientId: company2.id },
  });

  // Contactos con WhatsApp: dos con opt-in y uno sin (para probar el gating de eventos)
  const whatsappContacts = [
    { user: clientUser, phone: "+525512345678", optIn: true },
    { user: clientAdmin, phone: "+525523456789", optIn: true },
    { user: bajioUser, phone: "+524771234567", optIn: false },
  ];
  for (const c of whatsappContacts) {
    const owner = await prisma.user.findUnique({ where: { whatsappPhone: c.phone }, select: { id: true } });
    if (owner && owner.id !== c.user.id) {
      console.warn(`Aviso: ${c.phone} ya pertenece a otro usuario; se omite para ${c.user.email}`);
      continue;
    }
    await prisma.user.update({
      where: { id: c.user.id },
      data: {
        whatsappPhone: c.phone,
        whatsappOptIn: c.optIn,
        whatsappVerifiedAt: new Date(),
        whatsappVerifiedById: superAdmin.id,
      },
    });
  }

  // Conversación con mensaje reciente → ventana de 24 h abierta para Cliente Demo
  await prisma.whatsappConversation.upsert({
    where: { phone: "+525512345678" },
    update: { userId: clientUser.id, lastInboundAt: new Date(Date.now() - 2 * 3_600_000) },
    create: { phone: "+525512345678", userId: clientUser.id, state: "IDLE", lastInboundAt: new Date(Date.now() - 2 * 3_600_000) },
  });

  const redesCategory = await prisma.category.findUnique({ where: { name: "Redes" } });
  const seedCategory = redesCategory ?? helpDeskCategory;

  /** Crea el ticket solo si no existe (no modifica tickets reales con ese folio). */
  async function ensureTicket(folio: string, data: Omit<Prisma.TicketUncheckedCreateInput, "folio">) {
    const existing = await prisma.ticket.findUnique({ where: { folio } });
    if (existing) return { ticket: existing, created: false };
    return { ticket: await prisma.ticket.create({ data: { folio, ...data } }), created: true };
  }

  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);

  await ensureTicket("MB-0002", {
    title: "Correo no sincroniza en el celular",
    description: "Desde ayer el correo corporativo no baja mensajes nuevos en el teléfono.",
    status: TicketStatus.PENDING,
    priority: TicketPriority.MEDIUM,
    requesterId: clientUser.id,
    assigneeId: agent.id,
    categoryId: helpDeskCategory.id,
    clientId: company.id,
    activities: { create: [{ type: "CREATED", actorId: clientUser.id }] },
  });

  const cb1 = await ensureTicket("CB-0001", {
    title: "Internet intermitente en sucursal León",
    description: "Se cae la conexión cada 10 minutos desde las 9 am.",
    status: TicketStatus.OPEN,
    priority: TicketPriority.HIGH,
    sourceChannel: "WHATSAPP",
    externalMessageId: "wamid.seed.CB-0001",
    lastCustomerActivityAt: new Date(),
    requesterId: bajioUser.id,
    categoryId: seedCategory.id,
    clientId: company2.id,
    activities: { create: [{ type: "CREATED", actorId: bajioUser.id }] },
  });
  if (cb1.created) {
    await prisma.comment.create({
      data: {
        content: "Ya reinicié el módem y sigue igual.",
        channel: "WHATSAPP",
        externalMessageId: "wamid.seed.CB-0001.c1",
        ticketId: cb1.ticket.id,
        authorId: bajioUser.id,
      },
    });
  }

  const cb2 = await ensureTicket("CB-0002", {
    title: "Instalar impresora en recepción",
    description: "Nueva impresora de red, falta configurarla en 3 equipos.",
    status: TicketStatus.RESOLVED,
    priority: TicketPriority.LOW,
    requesterId: bajioUser.id,
    assigneeId: agent.id,
    categoryId: helpDeskCategory.id,
    clientId: company2.id,
    activities: {
      create: [
        { type: "CREATED", actorId: bajioUser.id },
        { type: "STATUS_CHANGE", field: "status", oldValue: "IN_PROGRESS", newValue: "RESOLVED", actorId: agent.id },
      ],
    },
  });
  if (cb2.created) {
    await prisma.comment.create({
      data: { content: "Impresora instalada y probada en los 3 equipos.", ticketId: cb2.ticket.id, authorId: agent.id },
    });
  }

  await ensureTicket("CB-0003", {
    title: "Acceso al ERP para nuevo empleado",
    description: "Alta de usuario en el ERP con perfil de ventas.",
    status: TicketStatus.CLOSED,
    priority: TicketPriority.MEDIUM,
    requesterId: bajioUser.id,
    assigneeId: agent.id,
    categoryId: helpDeskCategory.id,
    clientId: company2.id,
    activities: {
      create: [
        { type: "CREATED", actorId: bajioUser.id, createdAt: new Date(twoDaysAgo.getTime() - 86_400_000) },
        { type: "STATUS_CHANGE", field: "status", oldValue: "RESOLVED", newValue: "CLOSED", actorId: bajioUser.id, createdAt: twoDaysAgo },
      ],
    },
  });

  // API key de prueba para n8n: se imprime una sola vez. Fija con SEED_INTEGRATION_API_KEY.
  const seedKeyName = "n8n (seed dev)";
  let seedApiKeyMessage: string;
  const existingKey = await prisma.integrationApiKey.findFirst({ where: { name: seedKeyName, revokedAt: null } });
  if (existingKey) {
    seedApiKeyMessage = `ya existe (${existingKey.keyPrefix}…); revócala en Admin → Integraciones para regenerarla`;
  } else {
    const rawKey = process.env.SEED_INTEGRATION_API_KEY?.trim() || `mbk_${crypto.randomBytes(32).toString("base64url")}`;
    await prisma.integrationApiKey.create({
      data: {
        name: seedKeyName,
        keyPrefix: rawKey.slice(0, 8),
        keyHash: crypto.createHash("sha256").update(rawKey, "utf8").digest("hex"),
        scopesJson: JSON.stringify(["contacts:read", "tickets:read", "tickets:write", "conversations:write"]),
        createdById: superAdmin.id,
      },
    });
    seedApiKeyMessage = `${rawKey}   (guárdala: no se vuelve a mostrar)`;
  }

  console.log("Seed completado.");
  console.log("Superadmin:", superAdmin.email);
  console.log("Agente:", agent.email);
  console.log("Client admin:", clientAdmin.email);
  console.log("Client supervisor:", clientSupervisor.email);
  console.log("Client user:", clientUser.email);
  console.log("Cliente:", company.name);
  console.log("Cliente 2:", company2.name, "(usuario WhatsApp:", bajioUser.email + ")");
  console.log("Contactos WhatsApp:", whatsappContacts.map((c) => `${c.user.email} ${c.phone}${c.optIn ? "" : " (sin opt-in)"}`).join(" | "));
  console.log("API key n8n:", seedApiKeyMessage);
  console.log("Nota: lucia@comercialbajio.com usa la misma contraseña que cliente@demoindustrial.com.");

  const generated = Object.entries(generatedPasswords);
  if (generated.length > 0) {
    console.log("\nContraseñas generadas para cuentas NUEVAS (guárdalas ahora; no se vuelven a mostrar):");
    for (const [email, plain] of generated) console.log(`  ${email}  ->  ${plain}`);
    console.log("Para fijarlas tú, define SEED_ADMIN_PASSWORD, SEED_AGENT_PASSWORD, SEED_CLIENT_ADMIN_PASSWORD,");
    console.log("SEED_SUPERVISOR_PASSWORD y SEED_CLIENT_USER_PASSWORD antes de correr el seed.");
  }
}

main()
  .catch((error) => {
    console.error("Error en seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });