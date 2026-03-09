import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Definición de navegación por rol
// ---------------------------------------------------------------------------
type NavItem = {
  label: string;
  href: string;
  roles: string[]; // si está vacío = todos los roles autenticados
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",      href: "/dashboard",          roles: [] },
  { label: "Tickets",        href: "/tickets",             roles: [] },

  // Administración
  { label: "Usuarios",       href: "/admin/users",         roles: ["SUPERADMIN", "CLIENT_ADMIN"] },
  { label: "Clientes",       href: "/admin/clients",       roles: ["SUPERADMIN"] },
  { label: "Categorías",     href: "/admin/categories",    roles: ["SUPERADMIN", "CLIENT_ADMIN"] },
  { label: "Roles y permisos", href: "/admin/roles",       roles: ["SUPERADMIN"] },

  // Vista de empresa (CLIENT_SUPERVISOR)
  { label: "Equipo",         href: "/company/users",       roles: ["CLIENT_SUPERVISOR"] },
  { label: "Actividad",      href: "/company/audit",       roles: ["CLIENT_SUPERVISOR", "CLIENT_ADMIN"] },

  // Reportes y auditoría
  { label: "Reportes",       href: "/reports",             roles: ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"] },
  { label: "Auditoría",      href: "/admin/audit",         roles: ["SUPERADMIN"] },
];

// ---------------------------------------------------------------------------
// Componente de Logout (necesita acción de servidor)
// ---------------------------------------------------------------------------
function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-zinc-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
      >
        Cerrar sesión
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Layout principal
// ---------------------------------------------------------------------------
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const { user } = session;
  const roleKey = user.roleKey;

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.includes(roleKey)
  );

  // Load client branding if the user belongs to a client
  const clientBranding = user.clientId
    ? await prisma.clientCompany.findUnique({
        where: { id: user.clientId },
        select: { logoUrl: true, primaryColor: true, accentColor: true },
      })
    : null;

  const primary = clientBranding?.primaryColor ?? "#38d84e";
  const accent = clientBranding?.accentColor ?? "#7CFF8D";

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white">

      {/* ---- Sidebar ---- */}
      <aside className="flex w-64 flex-col border-r border-white/10 bg-[#0f0f0f]">

        {/* Logo / Brand */}
        <div className="border-b border-white/10 px-5 py-5">
          {clientBranding?.logoUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={clientBranding.logoUrl}
                alt={user.clientName ?? "Logo"}
                className="h-8 w-auto max-w-[120px] object-contain"
              />
            </div>
          ) : (
            <>
              <p
                className="text-xs font-medium uppercase tracking-[0.2em]"
                style={{ color: accent }}
              >
                {user.clientName ?? "Mirmibug"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">IT Services Platform</p>
            </>
          )}
        </div>

        {/* Información del usuario */}
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-zinc-500">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                borderColor: `${primary}4d`,
                backgroundColor: `${primary}1a`,
                color: accent,
                border: `1px solid ${primary}4d`,
              }}
            >
              {user.roleName}
            </span>
          </div>
          {user.clientName && (
            <p className="mt-1 text-xs text-zinc-600">{user.clientName}</p>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="border-t border-white/10 px-3 py-4">
          <LogoutButton />
        </div>
      </aside>

      {/* ---- Contenido principal ---- */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 bg-[#0f0f0f] px-6 py-3">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {user.clientName ?? "Global — Mirmibug"}
            </span>
            <div className="h-3 w-px bg-white/10" />
            <span className="text-xs text-zinc-400">{user.name}</span>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
