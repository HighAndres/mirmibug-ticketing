"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".pdf", ".txt", ".csv", ".zip",
  ".docx", ".xlsx", ".doc", ".xls",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ ticketId }: { ticketId: string }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setMessage(null);

    const fd = new FormData();
    fd.append("ticketId", ticketId);
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Error al subir archivos" });
      } else {
        setMessage({
          type: "success",
          text: `${data.attachments.length} archivo${data.attachments.length !== 1 ? "s" : ""} subido${data.attachments.length !== 1 ? "s" : ""}`,
        });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="text-xs text-zinc-400 file:mr-2 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-1.5 file:text-xs file:text-zinc-300 file:cursor-pointer hover:file:bg-white/10"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          {uploading ? "Subiendo..." : "Subir"}
        </button>
      </div>
      <p className="text-[10px] text-zinc-600">
        Máx. 10 MB por archivo, 5 archivos. PNG, JPG, PDF, ZIP, DOCX, XLSX, TXT.
      </p>
      {message && (
        <p className={`text-xs ${message.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function AttachmentList({
  attachments,
}: {
  attachments: { id: string; filename: string; mimeType: string; size: number; uploadedBy: { name: string }; createdAt: Date }[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith("image/");
        return (
          <a
            key={att.id}
            href={`/api/attachments/${att.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 transition hover:bg-white/5 group"
          >
            <span className="shrink-0 h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-zinc-500 uppercase font-medium">
              {isImage
                ? "IMG"
                : att.filename.split(".").pop()?.toUpperCase()?.slice(0, 4) ?? "?"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-300 truncate group-hover:text-white transition">
                {att.filename}
              </p>
              <p className="text-[10px] text-zinc-600">
                {formatSize(att.size)} — {att.uploadedBy.name} — {new Date(att.createdAt).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </div>
            <span className="shrink-0 text-xs text-zinc-600 group-hover:text-zinc-400 transition">
              Descargar
            </span>
          </a>
        );
      })}
    </div>
  );
}
