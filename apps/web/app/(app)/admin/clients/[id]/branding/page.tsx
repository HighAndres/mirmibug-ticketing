import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BrandingForm from "./BrandingForm";

export const metadata = { title: "Personalización del cliente" };

export default async function ClientBrandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const client = await prisma.clientCompany.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      welcomeText: true,
      supportPhone: true,
      supportEmail: true,
      address: true,
      timezone: true,
      slaHours: true,
    },
  });

  if (!client) notFound();

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4 mb-1">
            <Link
              href="/admin/clients"
              className="text-zinc-500 hover:text-zinc-300 transition text-sm"
            >
              ← Clientes
            </Link>
            <span className="text-zinc-700">/</span>
            <Link
              href={`/admin/clients/${id}/edit`}
              className="text-zinc-500 hover:text-zinc-300 transition text-sm"
            >
              {client.name}
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Personalización</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Configura el branding, identidad visual y operativa de <strong className="text-white">{client.name}</strong>
          </p>

          {/* Tab-style nav between Edit and Branding */}
          <div className="mt-4 flex gap-1">
            <Link
              href={`/admin/clients/${id}/edit`}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition hover:bg-white/5"
            >
              Datos generales
            </Link>
            <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-white/10">
              Personalización
            </span>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-3xl px-6 py-8">
        <BrandingForm client={client} />
      </section>
    </div>
  );
}
