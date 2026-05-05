import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-internal-api-key')
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clients = await prisma.clientCompany.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      contactEmail: true,
      supportPhone: true,
      supportEmail: true,
      address: true,
      timezone: true,
      slaHours: true,
      ticketPrefix: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { tickets: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    clients,
    count: clients.length,
    syncedAt: new Date().toISOString(),
  })
}
