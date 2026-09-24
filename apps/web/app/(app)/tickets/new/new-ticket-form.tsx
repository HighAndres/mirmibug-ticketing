"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { createTicket, type CreateTicketState } from "@/lib/actions/tickets";

export type FormClient = { id: string; name: string };
export type FormCategory = { id: string; name: string };
type Subcategory = { id: string; name: string };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 disabled:opacity-50";
const selectClass =
  "w-full rounded-xl border border-white/10 bg-[#15171c] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 disabled:opacity-50";

/**
 * Formulario de nuevo ticket.
 *
 * - Las categorías son un catálogo global: aplican a cualquier cliente, así que
 *   el selector de cliente (SUPERADMIN o agente multi-cliente) y el de categoría
 *   son independientes.
 * - Los errores de validación del servidor se muestran en el formulario en vez
 *   de la pantalla genérica de error, y los campos conservan lo escrito.
 */
export default function NewTicketForm({
  clients,
  categories,
  needsClientSelector,
  fixedClientId,
}: {
  clients: FormClient[];
  categories: FormCategory[];
  /** Mostrar selector de cliente (el usuario puede crear tickets para varios) */
  needsClientSelector: boolean;
  /** Cliente implícito (agente con un solo cliente); se envía como campo oculto */
  fixedClientId: string | null;
}) {
  const [state, formAction, pending] = useActionState<CreateTicketState, FormData>(
    createTicket,
    null
  );

  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");

  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Contador de peticiones para ignorar respuestas de categorías ya descartadas
  const subsRequestRef = useRef(0);

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    setSubcategoryId("");
    setSubcategories([]);

    const requestId = ++subsRequestRef.current;
    if (!value) {
      setLoadingSubs(false);
      return;
    }

    setLoadingSubs(true);
    fetch(`/api/subcategories?categoryId=${encodeURIComponent(value)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Subcategory[]) => {
        if (subsRequestRef.current !== requestId) return;
        setSubcategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (subsRequestRef.current === requestId) setSubcategories([]);
      })
      .finally(() => {
        if (subsRequestRef.current === requestId) setLoadingSubs(false);
      });
  }

  const clientChosen = !needsClientSelector || clientId !== "";
  const canSubmit =
    !pending && clientChosen && categoryId !== "" && title.trim() !== "" && description.trim() !== "";

  return (
    <form action={formAction} noValidate>
      <div className="rounded-2xl border border-white/10 bg-[#22262e] p-6 space-y-5">

        {/* Error del servidor */}
        {state?.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {state.error}
          </div>
        )}

        {/* Cliente (SUPERADMIN o agente multi-cliente) */}
        {needsClientSelector && (
          <div>
            <label htmlFor="clientId" className="block text-sm font-medium text-zinc-400 mb-2">
              Cliente <span className="text-red-400">*</span>
            </label>
            <select
              id="clientId"
              name="clientId"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={selectClass}
            >
              <option value="">Selecciona un cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cliente implícito para agentes con un solo cliente */}
        {fixedClientId && <input type="hidden" name="clientId" value={fixedClientId} />}

        {/* Título */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-zinc-400 mb-2">
            Título <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe el problema brevemente"
            className={inputClass}
          />
        </div>

        {/* Descripción */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-zinc-400 mb-2">
            Descripción <span className="text-red-400">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe el problema con detalle: pasos para reproducir, mensajes de error, equipos afectados..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Categoría */}
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-zinc-400 mb-2">
            Categoría <span className="text-red-400">*</span>
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={selectClass}
          >
            <option value="">Selecciona categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="mt-2 text-sm text-amber-300">
              No hay categorías registradas. Pide al Superadmin que cree una en Administración →
              Categorías.
            </p>
          )}
        </div>

        {/* Subcategoría */}
        {categoryId && (
          <div>
            <label htmlFor="subcategoryId" className="block text-sm font-medium text-zinc-400 mb-2">
              Subcategoría
            </label>
            {loadingSubs ? (
              <p className="text-sm text-zinc-500">Cargando subcategorías...</p>
            ) : subcategories.length > 0 ? (
              <select
                id="subcategoryId"
                name="subcategoryId"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className={selectClass}
              >
                <option value="">Sin subcategoría</option>
                {subcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-zinc-500">No hay subcategorías para esta categoría</p>
            )}
          </div>
        )}

        {/* Prioridad */}
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-zinc-400 mb-2">
            Prioridad
          </label>
          <select
            id="priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={selectClass}
          >
            <option value="LOW">Baja</option>
            <option value="MEDIUM">Media</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/tickets"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Creando…" : "Crear ticket"}
          </button>
        </div>
      </div>
    </form>
  );
}
