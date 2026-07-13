import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserClientIds } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json([]);

  const { user } = session;

  // Build tenant filter
  let tenantFilter = {};
  if (user.roleKey !== "SUPERADMIN") {
    if (user.roleKey === "AGENT") {
      const agentClientIds = await getUserClientIds(user.id, user.roleKey, user.clientId);
      if (agentClientIds.length > 0) {
        tenantFilter = { category: { clientId: { in: agentClientIds } } };
      } else {
        tenantFilter = { category: { clientId: "__none__" } };
      }
    } else {
      tenantFilter = { category: { clientId: user.clientId ?? "__none__" } };
    }
  }

  // Filtrar por tenant: solo subcategorías de categorías del mismo cliente
  const subcategories = await prisma.subcategory.findMany({
    where: {
      categoryId,
      ...tenantFilter,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json(subcategories);
}
