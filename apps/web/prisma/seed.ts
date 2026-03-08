import { PrismaClient, TicketPriority, TicketStatus, AuditAction } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

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
    permissions: permissionsData.map((p) => p.key),
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

async function main() {
  console.log("Iniciando seed seguro...");

  const superPassword = await bcrypt.hash("Admin1234!", 10);
  const agentPassword = await bcrypt.hash("Agent1234!", 10);
  const clientAdminPassword = await bcrypt.hash("ClientAdmin1234!", 10);
  const clientUserPassword = await bcrypt.hash("Client1234!", 10);

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

  const clientUserRole = await prisma.role.findUnique({
    where: { key: "CLIENT_USER" },
  });

  if (!superAdminRole || !clientAdminRole || !agentRole || !clientUserRole) {
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

  for (const category of categoriesData) {
    await prisma.category.upsert({
      where: {
        clientId_name: {
          clientId: company.id,
          name: category.name,
        },
      },
      update: {
        description: category.description,
      },
      create: {
        name: category.name,
        description: category.description,
        clientId: company.id,
      },
    });
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
    where: {
      clientId_name: {
        clientId: company.id,
        name: "Help Desk",
      },
    },
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

  console.log("Seed completado.");
  console.log("Superadmin:", superAdmin.email);
  console.log("Agente:", agent.email);
  console.log("Client admin:", clientAdmin.email);
  console.log("Client user:", clientUser.email);
  console.log("Cliente:", company.name);
}

main()
  .catch((error) => {
    console.error("Error en seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });