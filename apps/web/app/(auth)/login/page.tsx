import { prisma } from "@/lib/prisma";
import LoginForm from "@/components/LoginForm";
import type { TenantBranding } from "@/components/LoginForm";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = { title: "Iniciar sesión" };

// ---------------------------------------------------------------------------
// Server Component: detecta tenant por query param y carga branding
//
// Uso:
//   /login                       → Branding default de Mirmibug
//   /login?tenant=demo-industrial → Branding del cliente
//   /login?tenant=slug-invalido   → Fallback a Mirmibug
// ---------------------------------------------------------------------------
type PageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    tenant?: string;
  }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const tenantSlug = params.tenant;

  let branding: TenantBranding | null = null;

  if (tenantSlug) {
    const client = await prisma.clientCompany.findUnique({
      where: { slug: tenantSlug },
      select: {
        isActive: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        welcomeText: true,
        supportPhone: true,
        supportEmail: true,
      },
    });

    if (client && client.isActive) {
      branding = {
        name: client.name,
        logoUrl: client.logoUrl,
        primaryColor: client.primaryColor,
        accentColor: client.accentColor,
        welcomeText: client.welcomeText,
        supportPhone: client.supportPhone,
        supportEmail: client.supportEmail,
      };
    }
  }

  return <LoginForm branding={branding} callbackUrl={callbackUrl} />;
}
