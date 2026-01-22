import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { recalculateAllGroupBalances } from '@/lib/balance';
import Decimal from 'decimal.js';

/**
 * API endpoint to repair corrupted netBalance values.
 *
 * This recalculates all netBalance values for all members in all groups
 * using the correct formula:
 * netBalance = expenses_paid - shares_owed + payments_sent - payments_received
 *
 * POST /api/admin/repair-balances
 * Optional body: { groupId: string } to repair only a specific group
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse optional groupId from request body
    let targetGroupId: string | null = null;
    try {
      const body = await request.json();
      targetGroupId = body.groupId || null;
    } catch {
      // No body provided, repair all groups
    }

    // Get groups to repair
    const groups = targetGroupId
      ? await prisma.group.findMany({ where: { id: targetGroupId } })
      : await prisma.group.findMany();

    if (groups.length === 0) {
      return NextResponse.json({ error: "No groups found" }, { status: 404 });
    }

    const results: Array<{
      groupId: string;
      groupName: string;
      membersUpdated: number;
      balanceChanges: Array<{
        userName: string;
        oldBalance: string;
        newBalance: string;
        difference: string;
      }>;
    }> = [];

    for (const group of groups) {
      // Get current balances before repair
      const membersBefore = await prisma.membership.findMany({
        where: { groupId: group.id },
        include: { user: { select: { name: true, email: true } } },
      });

      const oldBalances = new Map<string, Decimal>();
      for (const m of membersBefore) {
        oldBalances.set(m.userId, new Decimal(m.netBalance.toString()));
      }

      // Repair all balances in a transaction
      await prisma.$transaction(async (tx) => {
        await recalculateAllGroupBalances(tx, group.id);
      });

      // Get new balances after repair
      const membersAfter = await prisma.membership.findMany({
        where: { groupId: group.id },
        include: { user: { select: { name: true, email: true } } },
      });

      const balanceChanges: Array<{
        userName: string;
        oldBalance: string;
        newBalance: string;
        difference: string;
      }> = [];

      for (const m of membersAfter) {
        const oldBalance = oldBalances.get(m.userId) || new Decimal(0);
        const newBalance = new Decimal(m.netBalance.toString());
        const difference = newBalance.minus(oldBalance);

        // Only include if there was a change
        if (!difference.isZero()) {
          balanceChanges.push({
            userName: m.user.name || m.user.email,
            oldBalance: oldBalance.toFixed(2),
            newBalance: newBalance.toFixed(2),
            difference: difference.toFixed(2),
          });
        }
      }

      results.push({
        groupId: group.id,
        groupName: group.name,
        membersUpdated: balanceChanges.length,
        balanceChanges,
      });
    }

    const totalChanges = results.reduce((sum, r) => sum + r.membersUpdated, 0);

    return NextResponse.json({
      success: true,
      message: `Repaired ${totalChanges} balance(s) across ${results.length} group(s)`,
      results,
    });
  } catch (error) {
    console.error("Repair balances error:", error);
    return NextResponse.json({ error: "Failed to repair balances" }, { status: 500 });
  }
}

/**
 * GET endpoint to preview what would be repaired without making changes.
 *
 * GET /api/admin/repair-balances
 * Optional query: ?groupId=xxx to check only a specific group
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetGroupId = searchParams.get('groupId');

    // Get groups to check
    const groups = targetGroupId
      ? await prisma.group.findMany({ where: { id: targetGroupId } })
      : await prisma.group.findMany();

    if (groups.length === 0) {
      return NextResponse.json({ error: "No groups found" }, { status: 404 });
    }

    const results: Array<{
      groupId: string;
      groupName: string;
      discrepancies: Array<{
        userName: string;
        userId: string;
        storedBalance: string;
        correctBalance: string;
        difference: string;
      }>;
    }> = [];

    for (const group of groups) {
      const memberships = await prisma.membership.findMany({
        where: { groupId: group.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      const discrepancies: Array<{
        userName: string;
        userId: string;
        storedBalance: string;
        correctBalance: string;
        difference: string;
      }> = [];

      for (const membership of memberships) {
        // Calculate correct balance
        const paymentsFrom = await prisma.payment.findMany({
          where: { groupId: group.id, fromId: membership.userId },
        });
        const paymentsTo = await prisma.payment.findMany({
          where: { groupId: group.id, toId: membership.userId },
        });
        const userExpenses = await prisma.expense.findMany({
          where: { groupId: group.id, payerId: membership.userId },
        });
        const userShares = await prisma.expenseShare.findMany({
          where: {
            userId: membership.userId,
            expense: { groupId: group.id },
          },
        });

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

        const correctBalance = expensesPaid.minus(sharesOwed).plus(paymentsSent).minus(paymentsReceived);
        const storedBalance = new Decimal(membership.netBalance.toString());
        const difference = correctBalance.minus(storedBalance);

        if (!difference.isZero()) {
          discrepancies.push({
            userName: membership.user.name || membership.user.email,
            userId: membership.userId,
            storedBalance: storedBalance.toFixed(2),
            correctBalance: correctBalance.toFixed(2),
            difference: difference.toFixed(2),
          });
        }
      }

      if (discrepancies.length > 0) {
        results.push({
          groupId: group.id,
          groupName: group.name,
          discrepancies,
        });
      }
    }

    const totalDiscrepancies = results.reduce((sum, r) => sum + r.discrepancies.length, 0);

    return NextResponse.json({
      totalDiscrepancies,
      message: totalDiscrepancies > 0
        ? `Found ${totalDiscrepancies} balance discrepancies. Use POST to repair.`
        : "All balances are correct!",
      results,
    });
  } catch (error) {
    console.error("Check balances error:", error);
    return NextResponse.json({ error: "Failed to check balances" }, { status: 500 });
  }
}
