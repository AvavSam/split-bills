import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { UpdateExpenseSchema, parseAmount } from '@/lib/validation';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

type RouteParams = { params: Promise<{ id: string; expenseId: string }> };

// Helper to recalculate netBalance for a user in a group
async function recalculateUserBalance(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  groupId: string
) {
  // Get all payments involving this user
  const paymentsFrom = await tx.payment.findMany({
    where: { groupId, fromId: userId },
  });
  const paymentsTo = await tx.payment.findMany({
    where: { groupId, toId: userId },
  });

  // Get all expenses paid by this user
  const userExpenses = await tx.expense.findMany({
    where: { groupId, payerId: userId },
  });

  // Get all expense shares for this user
  const userShares = await tx.expenseShare.findMany({
    where: {
      userId,
      expense: { groupId },
    },
  });

  // Calculate: paid (expenses) - owed (shares) + payments sent - payments received
  const expensesPaid = userExpenses.reduce(
    (sum, exp) => sum.plus(new Decimal(exp.totalAmount.toString())),
    new Decimal(0)
  );

  const sharesOwed = userShares.reduce(
    (sum, share) => sum.plus(new Decimal(share.shareAmount.toString())),
    new Decimal(0)
  );

  const paymentsSent = paymentsFrom.reduce(
    (sum, p) => sum.plus(new Decimal(p.amount.toString())),
    new Decimal(0)
  );

  const paymentsReceived = paymentsTo.reduce(
    (sum, p) => sum.plus(new Decimal(p.amount.toString())),
    new Decimal(0)
  );

  // Net balance = what you paid for others - what you owe + payments you sent - payments you received
  const netBalance = expensesPaid.minus(sharesOwed).plus(paymentsSent).minus(paymentsReceived);

  await tx.membership.update({
    where: { userId_groupId: { userId, groupId } },
    data: { netBalance },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId, groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        shares: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        items: true,
      },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (error) {
    console.error("Get expense error:", error);
    return NextResponse.json({ error: "Failed to fetch expense" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the existing expense to find affected users
    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId, groupId },
      include: { shares: true },
    });

    if (!existingExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = UpdateExpenseSchema.parse(body);

    const totalAmount = validated.totalAmount ? parseAmount(validated.totalAmount) : undefined;
    const taxAmount = validated.taxAmount ? parseAmount(validated.taxAmount) : undefined;

    const expense = await prisma.$transaction(async (tx) => {
      // Collect all affected user IDs (old payer, old participants, new payer, new participants)
      const affectedUserIds = new Set<string>();
      affectedUserIds.add(existingExpense.payerId);
      existingExpense.shares.forEach((s) => affectedUserIds.add(s.userId));

      if (validated.payerId) {
        affectedUserIds.add(validated.payerId);
      }
      if (validated.participants) {
        validated.participants.forEach((p) => affectedUserIds.add(p.userId));
      }

      // Update expense basic fields
      const updatedExpense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          title: validated.title,
          totalAmount,
          taxAmount,
          currency: validated.currency,
          payerId: validated.payerId,
          date: validated.date ? new Date(validated.date) : undefined,
          notes: validated.notes,
        },
      });

      // If participants are provided, replace all shares
      if (validated.participants && validated.participants.length > 0) {
        // Validate shares sum to total
        const newTotal = totalAmount ?? new Decimal(existingExpense.totalAmount.toString());
        const shareTotal = validated.participants.reduce((sum, p) => {
          return sum.plus(parseAmount(p.shareAmount));
        }, new Decimal(0));

        if (!shareTotal.equals(newTotal)) {
          throw new Error("Expense shares do not equal total amount");
        }

        // Delete existing shares
        await tx.expenseShare.deleteMany({
          where: { expenseId },
        });

        // Create new shares
        await tx.expenseShare.createMany({
          data: validated.participants.map((participant) => ({
            expenseId,
            userId: participant.userId,
            shareAmount: parseAmount(participant.shareAmount),
          })),
        });
      }

      // Recalculate netBalance for all affected users
      for (const userId of affectedUserIds) {
        await recalculateUserBalance(tx, userId, groupId);
      }

      return updatedExpense;
    });

    return NextResponse.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the expense to find all affected users
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId, groupId },
      include: { shares: true },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Collect all affected user IDs
      const affectedUserIds = new Set<string>();
      affectedUserIds.add(expense.payerId);
      expense.shares.forEach((s) => affectedUserIds.add(s.userId));

      // Delete the expense (cascade will delete shares and items)
      await tx.expense.delete({
        where: { id: expenseId },
      });

      // Recalculate netBalance for all affected users
      for (const userId of affectedUserIds) {
        await recalculateUserBalance(tx, userId, groupId);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
