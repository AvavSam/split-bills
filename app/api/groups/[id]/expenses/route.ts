import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { CreateExpenseSchema, parseAmount } from '@/lib/validation';
import { prisma } from '@/lib/prisma';
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

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        shares: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        items: true,
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Get expenses error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
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
    const validated = CreateExpenseSchema.parse(body);

    const totalAmount = parseAmount(validated.totalAmount);

    const expense = await prisma.$transaction(async (tx) => {
      // Create expense
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          title: validated.title,
          totalAmount,
          currency: validated.currency,
          payerId: validated.payerId,
          date: validated.date ? new Date(validated.date) : new Date(),
          notes: validated.notes,
        },
      });

      // Create items if provided
      if (validated.items && validated.items.length > 0) {
        await tx.expenseItem.createMany({
          data: validated.items.map((item) => ({
            expenseId: newExpense.id,
            name: item.name,
            price: parseAmount(item.price),
            quantity: item.quantity,
          })),
        });
      }

      // Create expense shares
      const shareTotal = validated.participants.reduce((sum, p) => {
        return sum.plus(parseAmount(p.shareAmount));
      }, new Decimal(0));

      // Validate shares sum to total
      if (!shareTotal.equals(totalAmount)) {
        throw new Error('Expense shares do not equal total amount');
      }

      await tx.expenseShare.createMany({
        data: validated.participants.map((participant) => ({
          expenseId: newExpense.id,
          userId: participant.userId,
          shareAmount: parseAmount(participant.shareAmount),
        })),
      });

      // Update netBalance for payer and all participants
      const allUserIds = [
        validated.payerId,
        ...validated.participants.map((p) => p.userId),
      ];

      for (const userId of allUserIds) {
        const currentMembership = await tx.membership.findUnique({
          where: { userId_groupId: { userId, groupId } },
        });

        if (currentMembership) {
          // Recompute balance from scratch (simplified)
          const userExpenses = await tx.expense.findMany({
            where: { groupId, payerId: userId },
          });

          const userShares = await tx.expenseShare.findMany({
            where: {
              userId,
              expense: { groupId }
            },
            include: { expense: true },
          });

          const paid = userExpenses.reduce(
            (sum, exp) => sum.plus(new Decimal(exp.totalAmount.toString())),
            new Decimal(0)
          );

          const owed = userShares.reduce(
            (sum, share) => sum.plus(new Decimal(share.shareAmount.toString())),
            new Decimal(0)
          );

          const netBalance = paid.minus(owed);

          await tx.membership.update({
            where: { userId_groupId: { userId, groupId } },
            data: { netBalance },
          });
        }
      }

      return newExpense;
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error('Create expense error:', error);
    return NextResponse.json(
      { error: 'Failed to create expense' },
      { status: 500 }
    );
  }
}
