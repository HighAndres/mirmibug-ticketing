import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-internal-api-key')
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const clientSlug = searchParams.get('clientSlug') ?? undefined
  const since = searchParams.get('since') ?? undefined

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(clientSlug ? { client: { slug: clientSlug } } : {}),
      ...(since ? { updatedAt: { gte: new Date(since) } } : {}),
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, slug: true } },
      comments: {
        where: { isInternal: false },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      activities: {
        select: {
          id: true,
          type: true,
          field: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })

  return NextResponse.json({
    tickets,
    count: tickets.length,
    syncedAt: new Date().toISOString(),
  })
}
