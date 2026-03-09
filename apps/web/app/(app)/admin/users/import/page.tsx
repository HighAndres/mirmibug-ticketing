import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportForm from "./ImportForm";

export const metadata = { title: "Importar usuarios" };

export default async function ImportUsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4 mb-1">
            <Link
              href="/admin/users"
              className="text-zinc-500 hover:text-zinc-300 transition text-sm"
            >
              ← Usuarios
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Importar usuarios</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Carga usuarios en masa desde un archivo CSV con sus roles asignados
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-3xl px-6 py-8">
        <ImportForm isSuperAdmin={user.roleKey === "SUPERADMIN"} />
      </section>
    </div>
  );
}
