import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReportPDF, type ReportData } from "@/lib/pdf-report";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/tickets";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/reports/pdf?clientId=xxx
// Genera y descarga un reporte PDF de tickets por cliente.
// SUPERADMIN puede generar para cualquier cliente o global.
// Otros roles solo pueden generar el reporte de su propio cliente.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { user } = session;

  // Solo ciertos roles pueden acceder
  if (!["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"].includes(user.roleKey)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Determinar el clientId del reporte
  const { searchParams } = new URL(request.url);
  const requestedClientId = searchParams.get("clientId");

  let clientId: string | null = null;
  let clientName = "Global — Mirmibug";

  if (user.roleKey === "SUPERADMIN") {
    // SUPERADMIN puede ver cualquier cliente o global (null)
    if (requestedClientId && requestedClientId !== "all") {
      const client = await prisma.clientCompany.findUnique({
        where: { id: requestedClientId },
        select: { id: true, name: true },
      });
      if (!client) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }
      clientId = client.id;
      clientName = client.name;
    }
    // Si no se pasa clientId o es "all", genera reporte global
  } else {
    // Otros roles solo ven su propio cliente
    clientId = user.clientId;
    clientName = user.clientName ?? "Mi empresa";
  }

  const clientFilter = clientId ? { clientId } : {};

  // ── Queries ─────────────────────────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 14);
  const lastWeekEnd = new Date(thisWeekStart);

  const [
    totalTickets,
    activeTickets,
    resolvedToday,
    unassignedTickets,
    thisWeekTickets,
    lastWeekTickets,
    byStatusRaw,
    byPriorityRaw,
    byAssigneeRaw,
    allTickets,
  ] = await Promise.all([
    prisma.ticket.count({ where: clientFilter }),
    prisma.ticket.count({
      where: { ...clientFilter, status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, status: "RESOLVED", updatedAt: { gte: todayStart } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, assigneeId: null },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, createdAt: { gte: thisWeekStart } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: clientFilter,
      _count: { id: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: clientFilter,
      _count: { id: true },
    }),
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...clientFilter, assigneeId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.ticket.findMany({
      where: clientFilter,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  ]);

  // Agent names for assignee stats
  const agentIds = byAssigneeRaw
    .map((r) => r.assigneeId)
    .filter(Boolean) as string[];

  const agentNames = agentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      })
    : [];

  const agentNameMap = Object.fromEntries(agentNames.map((a) => [a.id, a.name]));

  // ── Build report data ─────────────────────────────────────────────────
  const reportData: ReportData = {
    generatedAt: now,
    clientName,
    generatedBy: user.name ?? user.email ?? "Sistema",

    totalTickets,
    activeTickets,
    resolvedToday,
    unassignedTickets,
    thisWeekTickets,
    lastWeekTickets,

    byStatus: byStatusRaw.map((s) => ({
      status: s.status,
      label: STATUS_LABELS[s.status] ?? s.status,
      count: s._count.id,
    })),

    byPriority: byPriorityRaw.map((p) => ({
      priority: p.priority,
      label: PRIORITY_LABELS[p.priority] ?? p.priority,
      count: p._count.id,
    })),

    byAssignee: byAssigneeRaw.map((a) => ({
      name: agentNameMap[a.assigneeId!] ?? "Desconocido",
      count: a._count.id,
    })),

    tickets: allTickets.map((t) => ({
      folio: t.folio,
      title: t.title,
      status: t.status,
      statusLabel: STATUS_LABELS[t.status] ?? t.status,
      priority: t.priority,
      priorityLabel: PRIORITY_LABELS[t.priority] ?? t.priority,
      requester: t.requester.name,
      assignee: t.assignee?.name ?? null,
      category: t.category.name,
      createdAt: t.createdAt,
    })),
  };

  // ── Generate PDF ─────────────────────────────────────────────────────
  const pdfBuffer = await generateReportPDF(reportData);

  // Safe filename
  const safeClient = clientName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const dateTag = now.toISOString().slice(0, 10);
  const filename = `reporte_${safeClient}_${dateTag}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
