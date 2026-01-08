import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import {
  calculateSettlements,
  computeGroupBalances,
  UserBalance,
} from '@/lib/settlement';
import Decimal from 'decimal.js';

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

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all members
    const members = await prisma.membership.findMany({
      where: { groupId },
      include: { user: true },
    });

    // Compute balances
    const balances = await computeGroupBalances(groupId, prisma);

    // Build user balance objects
    const userBalances: UserBalance[] = members.map((m) => ({
      userId: m.userId,
      name: m.user.name || m.user.email,
      balance: balances.get(m.userId) || new Decimal(0),
    }));

    // Calculate settlements
    const settlements = calculateSettlements(userBalances);

    return NextResponse.json({
      settlements: settlements.map((s) => ({
        from: {
          id: s.fromUserId,
          name: s.fromUserName,
        },
        to: {
          id: s.toUserId,
          name: s.toUserName,
        },
        amount: s.amount.toFixed(2),
      })),
    });
  } catch (error) {
    console.error('Get settlements error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settlements' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groupId = params.id;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get suggested settlements
    const members = await prisma.membership.findMany({
      where: { groupId },
      include: { user: true },
    });

    const balances = await computeGroupBalances(groupId, prisma);

    const userBalances: UserBalance[] = members.map((m) => ({
      userId: m.userId,
      name: m.user.name || m.user.email,
      balance: balances.get(m.userId) || new Decimal(0),
    }));

    const settlements = calculateSettlements(userBalances);

    // Execute all settlements in a transaction
    await prisma.$transaction(
      settlements.map((settlement) =>
        prisma.payment.create({
          data: {
            groupId,
            fromId: settlement.fromUserId,
            toId: settlement.toUserId,
            amount: settlement.amount,
            note: 'Settlement transfer',
          },
        })
      )
    );

    // Update all member balances to 0 or near-zero
    await prisma.$transaction(
      members.map((m) =>
        prisma.membership.update({
          where: { userId_groupId: { userId: m.userId, groupId } },
          data: { netBalance: new Decimal(0) },
        })
      )
    );

    return NextResponse.json({
      message: 'Settlements recorded successfully',
      count: settlements.length,
    });
  } catch (error) {
    console.error('Execute settlements error:', error);
    return NextResponse.json(
      { error: 'Failed to execute settlements' },
      { status: 500 }
    );
  }
}
