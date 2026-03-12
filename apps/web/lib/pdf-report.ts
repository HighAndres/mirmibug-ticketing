import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface ReportData {
  generatedAt: Date;
  clientName: string;
  generatedBy: string;

  // KPIs
  totalTickets: number;
  activeTickets: number;
  resolvedToday: number;
  unassignedTickets: number;
  thisWeekTickets: number;
  lastWeekTickets: number;

  // Distribuciones
  byStatus: { status: string; label: string; count: number }[];
  byPriority: { priority: string; label: string; count: number }[];
  byAssignee: { name: string; count: number }[];

  // Tabla de tickets recientes
  tickets: {
    folio: string;
    title: string;
    status: string;
    statusLabel: string;
    priority: string;
    priorityLabel: string;
    requester: string;
    assignee: string | null;
    category: string;
    createdAt: Date;
  }[];
}

// ---------------------------------------------------------------------------
// Colores del tema Mirmibug
// ---------------------------------------------------------------------------
const COLORS = {
  bg: "#0a0a0a",
  card: "#111111",
  border: "#1f1f1f",
  primary: "#38d84e",
  accent: "#7CFF8D",
  textWhite: "#ffffff",
  textLight: "#d4d4d8",
  textMuted: "#71717a",
  textDim: "#52525b",
  blue: "#60a5fa",
  yellow: "#fbbf24",
  orange: "#fb923c",
  emerald: "#34d399",
  red: "#f87171",
  sky: "#38bdf8",
  amber: "#f59e0b",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: COLORS.blue,
  IN_PROGRESS: COLORS.yellow,
  PENDING: COLORS.orange,
  RESOLVED: COLORS.emerald,
  CLOSED: COLORS.textMuted,
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: COLORS.textMuted,
  MEDIUM: COLORS.sky,
  HIGH: COLORS.amber,
  URGENT: COLORS.red,
};

// ---------------------------------------------------------------------------
// Generador de PDF
// ---------------------------------------------------------------------------
export async function generateReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: `Reporte de Tickets — ${data.clientName}`,
        Author: "Mirmibug IT Services",
        Subject: "Reporte de operaciones de soporte",
        Creator: "Mirmibug Ticketing System",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ── Helper functions ─────────────────────────────────────────────────
    function drawLine(y: number) {
      doc
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .stroke();
    }

    function checkPageBreak(needed: number) {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }
    }

    function drawRoundedRect(
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
      radius = 4
    ) {
      doc.roundedRect(x, y, w, h, radius).fill(fill);
    }

    function drawBadge(
      text: string,
      x: number,
      y: number,
      color: string,
      width = 75
    ) {
      const badgeH = 16;
      drawRoundedRect(x, y, width, badgeH, color + "33", 8);
      doc
        .fontSize(7)
        .fillColor(color)
        .text(text, x, y + 4, { width, align: "center" });
    }

    // ── Header ────────────────────────────────────────────────────────────

    // Try to load logo
    const logoPath = path.join(
      process.cwd(),
      "public",
      "branding",
      "logo_mirmibug_360.png"
    );
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, doc.page.margins.left, doc.page.margins.top, {
          width: 40,
          height: 40,
        });
      } catch {
        // Logo load failed, continue without it
      }
    }

    doc
      .fontSize(18)
      .fillColor(COLORS.primary)
      .text("Mirmibug IT Services", doc.page.margins.left + 48, doc.page.margins.top + 4);

    doc
      .fontSize(9)
      .fillColor(COLORS.textMuted)
      .text("Sistema de Tickets — Reporte de Operaciones", doc.page.margins.left + 48, doc.page.margins.top + 24);

    doc.y = doc.page.margins.top + 50;
    drawLine(doc.y);
    doc.y += 12;

    // ── Report metadata ────────────────────────────────────────────────
    doc
      .fontSize(14)
      .fillColor(COLORS.textWhite)
      .text(`Reporte: ${data.clientName}`, doc.page.margins.left, doc.y);

    doc.y += 6;

    const dateStr = data.generatedAt.toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = data.generatedAt.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });

    doc
      .fontSize(8)
      .fillColor(COLORS.textDim)
      .text(`Generado el ${dateStr} a las ${timeStr} por ${data.generatedBy}`, doc.page.margins.left, doc.y);

    doc.y += 18;

    // ── KPI Cards ─────────────────────────────────────────────────────────
    const kpis = [
      { label: "Total tickets", value: data.totalTickets, color: COLORS.textWhite },
      { label: "Activos", value: data.activeTickets, color: COLORS.amber },
      { label: "Resueltos hoy", value: data.resolvedToday, color: COLORS.emerald },
      { label: "Sin asignar", value: data.unassignedTickets, color: data.unassignedTickets > 0 ? COLORS.red : COLORS.textMuted },
      { label: "Esta semana", value: data.thisWeekTickets, color: COLORS.sky },
      { label: "Semana ant.", value: data.lastWeekTickets, color: COLORS.textMuted },
    ];

    const kpiW = (pageWidth - 5 * 8) / 6;
    const kpiH = 52;
    const kpiY = doc.y;

    kpis.forEach((kpi, i) => {
      const x = doc.page.margins.left + i * (kpiW + 8);
      drawRoundedRect(x, kpiY, kpiW, kpiH, COLORS.card, 6);

      doc
        .fontSize(6.5)
        .fillColor(COLORS.textDim)
        .text(kpi.label.toUpperCase(), x + 6, kpiY + 8, { width: kpiW - 12 });

      doc
        .fontSize(16)
        .fillColor(kpi.color)
        .text(String(kpi.value), x + 6, kpiY + 24, { width: kpiW - 12 });
    });

    doc.y = kpiY + kpiH + 16;

    // ── Status & Priority distributions ───────────────────────────────────
    const distW = (pageWidth - 12) / 2;
    const distStartY = doc.y;

    // Status
    doc
      .fontSize(10)
      .fillColor(COLORS.textLight)
      .text("Tickets por estado", doc.page.margins.left, distStartY);

    let sy = distStartY + 18;
    data.byStatus.forEach((s: { status: string; label: string; count: number }) => {
      const pct = data.totalTickets > 0 ? (s.count / data.totalTickets) * 100 : 0;
      const barMaxW = distW - 100;
      const barW = Math.max(2, (pct / 100) * barMaxW);
      const color = STATUS_COLORS[s.status] ?? COLORS.textMuted;

      doc.fontSize(8).fillColor(COLORS.textLight).text(s.label, doc.page.margins.left, sy, { width: 70 });

      // Bar background
      drawRoundedRect(doc.page.margins.left + 72, sy + 1, barMaxW, 10, COLORS.card, 3);
      // Bar fill
      if (barW > 2) {
        drawRoundedRect(doc.page.margins.left + 72, sy + 1, barW, 10, color + "66", 3);
      }

      doc
        .fontSize(8)
        .fillColor(COLORS.textWhite)
        .text(String(s.count), doc.page.margins.left + 72 + barMaxW + 6, sy, { width: 24, align: "right" });

      doc
        .fontSize(7)
        .fillColor(COLORS.textDim)
        .text(`${Math.round(pct)}%`, doc.page.margins.left + 72 + barMaxW + 34, sy + 1);

      sy += 18;
    });

    // Priority
    const prioX = doc.page.margins.left + distW + 12;
    doc
      .fontSize(10)
      .fillColor(COLORS.textLight)
      .text("Tickets por prioridad", prioX, distStartY);

    let py = distStartY + 18;
    data.byPriority.forEach((p: { priority: string; label: string; count: number }) => {
      const pct = data.totalTickets > 0 ? (p.count / data.totalTickets) * 100 : 0;
      const barMaxW = distW - 100;
      const barW = Math.max(2, (pct / 100) * barMaxW);
      const color = PRIORITY_COLORS[p.priority] ?? COLORS.textMuted;

      doc.fontSize(8).fillColor(COLORS.textLight).text(p.label, prioX, py, { width: 70 });

      drawRoundedRect(prioX + 72, py + 1, barMaxW, 10, COLORS.card, 3);
      if (barW > 2) {
        drawRoundedRect(prioX + 72, py + 1, barW, 10, color + "66", 3);
      }

      doc
        .fontSize(8)
        .fillColor(COLORS.textWhite)
        .text(String(p.count), prioX + 72 + barMaxW + 6, py, { width: 24, align: "right" });

      doc
        .fontSize(7)
        .fillColor(COLORS.textDim)
        .text(`${Math.round(pct)}%`, prioX + 72 + barMaxW + 34, py + 1);

      py += 18;
    });

    doc.y = Math.max(sy, py) + 12;

    // ── Tickets by Assignee ──────────────────────────────────────────────
    if (data.byAssignee.length > 0) {
      checkPageBreak(30 + data.byAssignee.length * 18);

      doc
        .fontSize(10)
        .fillColor(COLORS.textLight)
        .text("Carga por agente", doc.page.margins.left, doc.y);

      doc.y += 18;
      const maxA = data.byAssignee[0]?.count ?? 1;

      data.byAssignee.forEach((a: { name: string; count: number }) => {
        const barMaxW = pageWidth - 160;
        const barW = Math.max(2, (a.count / maxA) * barMaxW);

        doc
          .fontSize(8)
          .fillColor(COLORS.textLight)
          .text(a.name, doc.page.margins.left, doc.y, { width: 110, lineBreak: false });

        drawRoundedRect(doc.page.margins.left + 115, doc.y + 1, barMaxW, 10, COLORS.card, 3);
        drawRoundedRect(doc.page.margins.left + 115, doc.y + 1, barW, 10, COLORS.primary + "66", 3);

        doc
          .fontSize(8)
          .fillColor(COLORS.textWhite)
          .text(String(a.count), doc.page.margins.left + 115 + barMaxW + 8, doc.y, {
            width: 30,
            align: "right",
          });

        doc.y += 18;
      });

      doc.y += 8;
    }

    // ── Tickets table ───────────────────────────────────────────────────
    drawLine(doc.y);
    doc.y += 12;

    doc
      .fontSize(12)
      .fillColor(COLORS.textWhite)
      .text("Detalle de tickets", doc.page.margins.left, doc.y);

    doc.y += 6;
    doc
      .fontSize(8)
      .fillColor(COLORS.textDim)
      .text(`${data.tickets.length} tickets incluidos en este reporte`, doc.page.margins.left, doc.y);

    doc.y += 14;

    // Table header
    const cols = [
      { label: "Folio", w: 55, x: 0 },
      { label: "Titulo", w: 160, x: 55 },
      { label: "Estado", w: 70, x: 215 },
      { label: "Prioridad", w: 70, x: 285 },
      { label: "Solicitante", w: 80, x: 355 },
      { label: "Asignado", w: 80, x: 435 },
      { label: "Fecha", w: pageWidth - 515, x: 515 },
    ];

    const headerY = doc.y;
    drawRoundedRect(doc.page.margins.left, headerY, pageWidth, 18, COLORS.card, 3);

    cols.forEach((col: { label: string; w: number; x: number }) => {
      doc
        .fontSize(7)
        .fillColor(COLORS.textMuted)
        .text(
          col.label.toUpperCase(),
          doc.page.margins.left + col.x + 4,
          headerY + 5,
          { width: col.w - 8, lineBreak: false }
        );
    });

    doc.y = headerY + 22;

    // Table rows
    data.tickets.forEach((ticket, idx) => {
      checkPageBreak(22);

      const rowY = doc.y;

      // Alternating background
      if (idx % 2 === 0) {
        drawRoundedRect(doc.page.margins.left, rowY, pageWidth, 18, COLORS.card + "80", 2);
      }

      // Folio
      doc
        .fontSize(7.5)
        .fillColor(COLORS.primary)
        .text(ticket.folio, doc.page.margins.left + cols[0].x + 4, rowY + 5, {
          width: cols[0].w - 8,
          lineBreak: false,
        });

      // Title (truncated)
      const maxTitleLen = 38;
      const truncTitle = ticket.title.length > maxTitleLen
        ? ticket.title.slice(0, maxTitleLen) + "..."
        : ticket.title;
      doc
        .fontSize(7.5)
        .fillColor(COLORS.textWhite)
        .text(truncTitle, doc.page.margins.left + cols[1].x + 4, rowY + 5, {
          width: cols[1].w - 8,
          lineBreak: false,
        });

      // Status badge
      drawBadge(
        ticket.statusLabel,
        doc.page.margins.left + cols[2].x + 4,
        rowY + 1,
        STATUS_COLORS[ticket.status] ?? COLORS.textMuted,
        cols[2].w - 8
      );

      // Priority badge
      drawBadge(
        ticket.priorityLabel,
        doc.page.margins.left + cols[3].x + 4,
        rowY + 1,
        PRIORITY_COLORS[ticket.priority] ?? COLORS.textMuted,
        cols[3].w - 8
      );

      // Requester
      doc
        .fontSize(7)
        .fillColor(COLORS.textLight)
        .text(ticket.requester, doc.page.margins.left + cols[4].x + 4, rowY + 5, {
          width: cols[4].w - 8,
          lineBreak: false,
        });

      // Assignee
      doc
        .fontSize(7)
        .fillColor(ticket.assignee ? COLORS.textLight : COLORS.textDim)
        .text(
          ticket.assignee ?? "Sin asignar",
          doc.page.margins.left + cols[5].x + 4,
          rowY + 5,
          { width: cols[5].w - 8, lineBreak: false }
        );

      // Date
      const dateFormatted = ticket.createdAt.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      doc
        .fontSize(7)
        .fillColor(COLORS.textDim)
        .text(dateFormatted, doc.page.margins.left + cols[6].x + 4, rowY + 5, {
          width: cols[6].w - 8,
          lineBreak: false,
        });

      doc.y = rowY + 20;
    });

    // ── Footer ────────────────────────────────────────────────────────────
    doc.y += 16;
    drawLine(doc.y);
    doc.y += 8;

    doc
      .fontSize(7)
      .fillColor(COLORS.textDim)
      .text(
        `Reporte generado por Mirmibug IT Services — ${dateStr} ${timeStr}`,
        doc.page.margins.left,
        doc.y,
        { align: "center", width: pageWidth }
      );

    doc
      .fontSize(6)
      .fillColor(COLORS.textDim)
      .text(
        "Este documento es confidencial y de uso exclusivo de la organización indicada.",
        doc.page.margins.left,
        doc.y + 12,
        { align: "center", width: pageWidth }
      );

    doc.end();
  });
}
