import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json([], { status: 401 });

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json([]);

  const { user } = session;

  // Filtrar por tenant: solo subcategorías de categorías del mismo cliente
  const subcategories = await prisma.subcategory.findMany({
    where: {
      categoryId,
      ...(user.roleKey !== "SUPERADMIN"
        ? { category: { clientId: user.clientId ?? "__none__" } }
        : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json(subcategories);
}
