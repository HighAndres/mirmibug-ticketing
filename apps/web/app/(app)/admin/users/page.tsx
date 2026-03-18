import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsersTable from "./users-table";

export const metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  const isSuperAdmin = user.roleKey === "SUPERADMIN";

  const clientFilter = isSuperAdmin ? {} : { clientId: user.clientId ?? "__none__" };

  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      where: clientFilter,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        role: { select: { name: true, key: true } },
        client: { select: { name: true } },
        _count: { select: { tickets: true } },
        userClients: { include: { client: { select: { name: true } } } },
      },
    }),
    isSuperAdmin
      ? prisma.clientCompany.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const userRows = users.map((u: (typeof users)[number]) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    roleName: u.role?.name ?? "Sin rol",
    roleKey: u.role?.key ?? "",
    clientName: u.client?.name ?? null,
    clientId: u.clientId,
    ticketCount: u._count.tickets,
    assignedClientNames: u.userClients.map((uc: { client: { name: string } }) => uc.client.name),
  }));

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {users.length} usuario{users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/users/import"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              Importar CSV
            </Link>
            <Link
              href="/admin/users/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
            >
              + Nuevo usuario
            </Link>
          </div>
        </div>
      </section>

      {/* Tabs + Filters + Table */}
      <UsersTable
        users={userRows}
        clients={clients}
        isSuperAdmin={isSuperAdmin}
        currentUserId={user.id}
      />
    </div>
  );
}
