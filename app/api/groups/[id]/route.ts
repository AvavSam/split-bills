import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { computeGroupBalances } from '@/lib/settlement';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groupId = params.id;

    // Check membership
    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        memberships: {
          include: { user: true },
        },
        expenses: { include: { shares: true } },
        payments: true,
      },
    });

    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Compute balances
    const balances = await computeGroupBalances(groupId, prisma);

    return NextResponse.json({
      ...group,
      balances: Object.fromEntries(balances),
    });
  } catch (error) {
    console.error('Get group error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
}
