import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Las categorías y subcategorías son un catálogo global (aplican a cualquier
// cliente), así que solo se requiere una sesión válida.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json([]);

  const subcategories = await prisma.subcategory.findMany({
    where: { categoryId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json(subcategories);
}
