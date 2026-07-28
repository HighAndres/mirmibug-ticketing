import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig, type EmailConfig, type ToggleKey } from "@/lib/email-settings";

// ── Transport (construido según la config de BD/entorno) ──────────────────────

// Cache del transporter por firma de conexión, para no recrearlo en cada envío.
let _cached: { sig: string; transporter: Transporter } | null = null;

function buildTransporter(config: EmailConfig): Transporter {
  const sig = JSON.stringify({ h: config.host, p: config.port, u: config.user, s: config.secure, pw: !!config.pass });
  if (_cached && _cached.sig === sig) return _cached.transporter;

  const transporter = config.host
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true }); // sin SMTP → log en consola

  _cached = { sig, transporter };
  return transporter;
}

const APP_URL = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** ¿Están habilitadas las notificaciones de este tipo? (switch maestro + toggle) */
async function typeEnabled(type: ToggleKey): Promise<boolean> {
  const config = await getEmailConfig();
  return config.enabled && config.toggles[type];
}

// ── Core send function ────────────────────────────────────────────────────────

async function sendMail(to: string, subject: string, html: string) {
  if (!to) return;
  const config = await getEmailConfig();
  const t = buildTransporter(config);
  try {
    const info = await t.sendMail({ from: config.from, to, subject, html });
    if (!config.host) {
      console.log(`[mailer] (sin SMTP) → ${to} | ${subject}`);
    }
    return info;
  } catch (err) {
    // Never let email errors break the request
    console.error("[mailer] Failed to send email:", err);
  }
}

/**
 * Envío de prueba: usa la config guardada e ignora el switch maestro y toggles.
 * Devuelve un resultado legible para la UI. Lanza si no hay SMTP configurado.
 */
export async function sendTestMail(to: string): Promise<{ ok: boolean; message: string }> {
  const config = await getEmailConfig(true);
  if (!config.host) {
    return { ok: false, message: "No hay servidor SMTP configurado. Guarda el host antes de probar." };
  }
  const t = buildTransporter(config);
  try {
    await t.sendMail({
      from: config.from,
      to,
      subject: "Correo de prueba — Mirmibug",
      html: template(
        "Correo de prueba",
        `<p style="margin:0;font-size:14px;color:#3f3f46">Si recibes este mensaje, la configuración SMTP de Mirmibug funciona correctamente. 🎉</p>`
      ),
    });
    return { ok: true, message: `Correo de prueba enviado a ${to}.` };
  } catch (err) {
    return { ok: false, message: `Error al enviar: ${(err as Error).message}` };
  }
}

// ── HTML template ─────────────────────────────────────────────────────────────

function template(title: string, body: string, ctaLabel?: string, ctaUrl?: string) {
  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0">
        <a href="${ctaUrl}" style="background:#38d84e;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;display:inline-block">
          ${ctaLabel}
        </a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:#0f0f0f;padding:20px 28px">
            <span style="font-size:13px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#7CFF8D">MIRMIBUG</span>
            <span style="font-size:11px;color:#52525b;margin-left:10px">IT Services Platform</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px">
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#09090b">${title}</h1>
            ${body}
            ${cta}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:16px 28px;font-size:11px;color:#a1a1aa;text-align:center">
            Este correo fue generado automáticamente. No respondas a este mensaje.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function field(label: string, value: string) {
  return `<p style="margin:6px 0;font-size:14px;color:#3f3f46">
    <strong style="color:#09090b">${label}:</strong> ${value}
  </p>`;
}

function badge(text: string, color = "#38d84e") {
  return `<span style="display:inline-block;background:${color}22;border:1px solid ${color}44;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;color:${color}">${text}</span>`;
}

// ── Ticket notifications ──────────────────────────────────────────────────────

type TicketBasic = {
  folio: string;
  title: string;
  id: string;
  status: string;
  priority: string;
};

const STATUS_ES: Record<string, string> = {
  OPEN: "Abierto", IN_PROGRESS: "En progreso", PENDING: "Pendiente",
  RESOLVED: "Resuelto", CLOSED: "Cerrado",
};
const PRIORITY_ES: Record<string, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "#60a5fa", IN_PROGRESS: "#a78bfa", PENDING: "#fbbf24",
  RESOLVED: "#34d399", CLOSED: "#71717a",
};
const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#60a5fa", MEDIUM: "#fbbf24", HIGH: "#f97316", URGENT: "#ef4444",
};

/** Ticket creado → notifica al solicitante */
export async function notifyTicketCreated(
  requesterEmail: string,
  requesterName: string,
  ticket: TicketBasic
) {
  if (!(await typeEnabled("onTicketCreated"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${requesterName}</strong>, tu ticket ha sido registrado exitosamente.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      ${field("Estado", badge(STATUS_ES[ticket.status] ?? ticket.status, STATUS_COLOR[ticket.status]))}
      ${field("Prioridad", badge(PRIORITY_ES[ticket.priority] ?? ticket.priority, PRIORITY_COLOR[ticket.priority]))}
    </div>
    <p style="margin:0;font-size:13px;color:#71717a">
      Recibirás actualizaciones cuando el estado cambie o se agreguen comentarios.
    </p>`;

  await sendMail(
    requesterEmail,
    `[${ticket.folio}] Ticket creado: ${ticket.title}`,
    template(`Ticket ${ticket.folio} creado`, body, "Ver ticket", url)
  );
}

/** Ticket asignado → notifica al agente asignado */
export async function notifyTicketAssigned(
  assigneeEmail: string,
  assigneeName: string,
  ticket: TicketBasic,
  requesterName: string
) {
  if (!(await typeEnabled("onTicketAssigned"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${assigneeName}</strong>, se te ha asignado un ticket de soporte.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      ${field("Solicitante", requesterName)}
      ${field("Prioridad", badge(PRIORITY_ES[ticket.priority] ?? ticket.priority, PRIORITY_COLOR[ticket.priority]))}
    </div>`;

  await sendMail(
    assigneeEmail,
    `[${ticket.folio}] Ticket asignado: ${ticket.title}`,
    template(`Ticket ${ticket.folio} asignado a ti`, body, "Abrir ticket", url)
  );
}

/** Estado cambiado → notifica al solicitante y, si hay, al asignado */
export async function notifyStatusChanged(
  ticket: TicketBasic,
  previousStatus: string,
  requesterEmail: string,
  requesterName: string,
  assigneeEmail?: string | null,
  assigneeName?: string | null
) {
  if (!(await typeEnabled("onStatusChanged"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const prevLabel = STATUS_ES[previousStatus] ?? previousStatus;
  const newLabel = STATUS_ES[ticket.status] ?? ticket.status;

  const makeBody = (recipientName: string) => `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${recipientName}</strong>, el estado del ticket <strong>${ticket.folio}</strong> ha cambiado.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      ${field("Estado anterior", badge(prevLabel, STATUS_COLOR[previousStatus] ?? "#71717a"))}
      ${field("Nuevo estado", badge(newLabel, STATUS_COLOR[ticket.status] ?? "#71717a"))}
    </div>`;

  await sendMail(
    requesterEmail,
    `[${ticket.folio}] Estado actualizado a "${newLabel}"`,
    template(`Estado: ${newLabel}`, makeBody(requesterName), "Ver ticket", url)
  );

  if (assigneeEmail && assigneeName && assigneeEmail !== requesterEmail) {
    await sendMail(
      assigneeEmail,
      `[${ticket.folio}] Estado actualizado a "${newLabel}"`,
      template(`Estado: ${newLabel}`, makeBody(assigneeName), "Ver ticket", url)
    );
  }
}

/** Nuevo comentario público → notifica al solicitante (si no es él quien comenta) y al asignado */
export async function notifyNewComment(
  ticket: TicketBasic,
  commentAuthorId: string,
  commentPreview: string,
  requesterEmail: string,
  requesterName: string,
  requesterId: string,
  assigneeEmail?: string | null,
  assigneeName?: string | null,
  assigneeId?: string | null
) {
  if (!(await typeEnabled("onNewComment"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const preview = commentPreview.length > 200 ? commentPreview.slice(0, 200) + "…" : commentPreview;

  const makeBody = (recipientName: string) => `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${recipientName}</strong>, hay un nuevo comentario en el ticket <strong>${ticket.folio}</strong>.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      <div style="margin-top:10px;padding:10px;background:#f0fdf4;border-left:3px solid #38d84e;border-radius:4px;font-size:13px;color:#3f3f46">
        ${preview}
      </div>
    </div>`;

  if (commentAuthorId !== requesterId) {
    await sendMail(
      requesterEmail,
      `[${ticket.folio}] Nuevo comentario en tu ticket`,
      template("Nuevo comentario", makeBody(requesterName), "Ver ticket", url)
    );
  }

  if (assigneeEmail && assigneeName && assigneeId && commentAuthorId !== assigneeId) {
    await sendMail(
      assigneeEmail,
      `[${ticket.folio}] Nuevo comentario`,
      template("Nuevo comentario", makeBody(assigneeName), "Ver ticket", url)
    );
  }
}

// ── Colaboradores ─────────────────────────────────────────────────────────────

type Recipient = { email: string; name: string };

/** Colaborador agregado → le avisa que ahora sigue el ticket */
export async function notifyCollaboratorAdded(
  collaborator: Recipient,
  ticket: TicketBasic,
  addedByName: string
) {
  if (!(await typeEnabled("onCollaboratorAdded"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${collaborator.name}</strong>, <strong>${addedByName}</strong> te agregó como colaborador del ticket <strong>${ticket.folio}</strong>. A partir de ahora recibirás sus actualizaciones.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      ${field("Estado", badge(STATUS_ES[ticket.status] ?? ticket.status, STATUS_COLOR[ticket.status]))}
    </div>`;

  await sendMail(
    collaborator.email,
    `[${ticket.folio}] Fuiste agregado como colaborador`,
    template(`Colaboras en ${ticket.folio}`, body, "Ver ticket", url)
  );
}

/** Cambio de estado → avisa a la lista de colaboradores */
export async function notifyCollaboratorsStatusChanged(
  ticket: TicketBasic,
  previousStatus: string,
  collaborators: Recipient[]
) {
  if (collaborators.length === 0) return;
  if (!(await typeEnabled("onStatusChanged"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const prevLabel = STATUS_ES[previousStatus] ?? previousStatus;
  const newLabel = STATUS_ES[ticket.status] ?? ticket.status;

  const makeBody = (name: string) => `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${name}</strong>, el estado del ticket <strong>${ticket.folio}</strong> que sigues ha cambiado.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      ${field("Estado anterior", badge(prevLabel, STATUS_COLOR[previousStatus] ?? "#71717a"))}
      ${field("Nuevo estado", badge(newLabel, STATUS_COLOR[ticket.status] ?? "#71717a"))}
    </div>`;

  for (const c of collaborators) {
    await sendMail(
      c.email,
      `[${ticket.folio}] Estado actualizado a "${newLabel}"`,
      template(`Estado: ${newLabel}`, makeBody(c.name), "Ver ticket", url)
    );
  }
}

/** Nuevo comentario público → avisa a la lista de colaboradores */
export async function notifyCollaboratorsNewComment(
  ticket: TicketBasic,
  commentPreview: string,
  collaborators: Recipient[]
) {
  if (collaborators.length === 0) return;
  if (!(await typeEnabled("onNewComment"))) return;
  const url = `${APP_URL}/tickets/${ticket.id}`;
  const preview = commentPreview.length > 200 ? commentPreview.slice(0, 200) + "…" : commentPreview;

  const makeBody = (name: string) => `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46">
      Hola <strong>${name}</strong>, hay un nuevo comentario en el ticket <strong>${ticket.folio}</strong> que sigues.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:16px;margin-bottom:16px">
      ${field("Folio", `<strong>${ticket.folio}</strong>`)}
      ${field("Título", ticket.title)}
      <div style="margin-top:10px;padding:10px;background:#f0fdf4;border-left:3px solid #38d84e;border-radius:4px;font-size:13px;color:#3f3f46">
        ${preview}
      </div>
    </div>`;

  for (const c of collaborators) {
    await sendMail(
      c.email,
      `[${ticket.folio}] Nuevo comentario`,
      template("Nuevo comentario", makeBody(c.name), "Ver ticket", url)
    );
  }
}
