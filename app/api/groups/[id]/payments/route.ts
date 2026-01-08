import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { CreatePaymentSchema, parseAmount } from '@/lib/validation';
import { prisma } from '@/lib/prisma';

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

    const payments = await prisma.payment.findMany({
      where: { groupId },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error('Get payments error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
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

    const body = await request.json();
    const validated = CreatePaymentSchema.parse(body);

    const amount = parseAmount(validated.amount);

    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          groupId,
          fromId: validated.fromId,
          toId: validated.toId,
          amount,
          note: validated.note,
        },
      });

      // Update netBalances
      const fromMembership = await tx.membership.findUnique({
        where: { userId_groupId: { userId: validated.fromId, groupId } },
      });

      const toMembership = await tx.membership.findUnique({
        where: { userId_groupId: { userId: validated.toId, groupId } },
      });

      if (fromMembership) {
        await tx.membership.update({
          where: { userId_groupId: { userId: validated.fromId, groupId } },
          data: {
            netBalance: fromMembership.netBalance.minus(amount),
          },
        });
      }

      if (toMembership) {
        await tx.membership.update({
          where: { userId_groupId: { userId: validated.toId, groupId } },
          data: {
            netBalance: toMembership.netBalance.plus(amount),
          },
        });
      }

      return newPayment;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Create payment error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
