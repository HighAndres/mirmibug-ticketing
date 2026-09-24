import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewTicketForm, { type FormCategory, type FormClient } from "./new-ticket-form";

export const metadata = { title: "Nuevo ticket" };

export default async function NewTicketPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { user } = session;
  const isSuperAdmin = user.roleKey === "SUPERADMIN";

  // Agente multi-cliente: obtener sus clientes asignados
  const isAgentMultiClient = user.roleKey === "AGENT" && !user.clientId;
  let agentClientIds: string[] = [];
  if (isAgentMultiClient) {
    const rows = await prisma.userClient.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });
    agentClientIds = rows.map((r: (typeof rows)[number]) => r.clientId);
  }

  // El usuario elige cliente cuando puede crear tickets para más de uno
  const needsClientSelector = isSuperAdmin || (isAgentMultiClient && agentClientIds.length > 1);

  // Agente con un solo cliente asignado: el cliente va implícito
  const fixedClientId =
    isAgentMultiClient && agentClientIds.length === 1 ? agentClientIds[0] : null;

  // Cargar categorías disponibles según el cliente del usuario
  const categoryFilter = isSuperAdmin
    ? {}
    : isAgentMultiClient
    ? { clientId: { in: agentClientIds } }
    : user.clientId
    ? { clientId: user.clientId }
    : { clientId: "__none__" };

  const categoryRows = await prisma.category.findMany({
    where: categoryFilter,
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    include: { client: { select: { name: true, id: true } } },
  });

  const categories: FormCategory[] = categoryRows.map((c: (typeof categoryRows)[number]) => ({
    id: c.id,
    name: c.name,
    clientId: c.client.id,
    clientName: c.client.name,
  }));

  // Lista de clientes activos para el selector
  const clientRows = isSuperAdmin
    ? await prisma.clientCompany.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : isAgentMultiClient
    ? await prisma.clientCompany.findMany({
        where: { id: { in: agentClientIds }, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const clients: FormClient[] = clientRows.map((c: (typeof clientRows)[number]) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="min-h-full bg-[#15171c] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#1c1f26] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/tickets"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Tickets
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Nuevo ticket</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Se generará el folio automáticamente al guardar
            </p>
          </div>
        </div>
      </section>

      {/* Formulario */}
      <section className="mx-auto max-w-3xl px-6 py-8">
        <NewTicketForm
          clients={clients}
          categories={categories}
          needsClientSelector={needsClientSelector}
          fixedClientId={fixedClientId}
        />
      </section>
    </div>
  );
}
