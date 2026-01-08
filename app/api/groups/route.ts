import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { CreateGroupSchema } from '@/lib/validation';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groups = await prisma.group.findMany({
      where: {
        memberships: {
          some: { userId: user.userId },
        },
      },
      include: {
        memberships: true,
      },
    });

    return NextResponse.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = CreateGroupSchema.parse(body);

    const group = await prisma.group.create({
      data: {
        name: validated.name,
        currency: validated.currency,
        memberships: {
          create: {
            userId: user.userId,
            role: 'admin',
          },
        },
      },
      include: { memberships: true },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error('Create group error:', error);
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    );
  }
}
