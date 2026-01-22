import { PrismaClient } from '@/generated/prisma/client';
import Decimal from 'decimal.js';

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Recalculate netBalance for a user in a group.
 *
 * Formula: netBalance = expenses_paid - shares_owed + payments_sent - payments_received
 *
 * - expenses_paid: Total amount of expenses where user is the payer
 * - shares_owed: Total amount of user's shares in all expenses
 * - payments_sent: Total payments made by user to others
 * - payments_received: Total payments received by user from others
 *
 * @param tx - Prisma transaction client
 * @param userId - User ID to recalculate balance for
 * @param groupId - Group ID to recalculate balance in
 */
export async function recalculateUserBalance(
  tx: TransactionClient,
  userId: string,
  groupId: string
): Promise<Decimal> {
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

  return netBalance;
}

/**
 * Recalculate netBalance for multiple users in a group.
 *
 * @param tx - Prisma transaction client
 * @param userIds - Set or Array of user IDs to recalculate
 * @param groupId - Group ID to recalculate balances in
 */
export async function recalculateUsersBalances(
  tx: TransactionClient,
  userIds: Set<string> | string[],
  groupId: string
): Promise<void> {
  const ids = Array.isArray(userIds) ? userIds : Array.from(userIds);
  for (const userId of ids) {
    await recalculateUserBalance(tx, userId, groupId);
  }
}

/**
 * Recalculate netBalance for ALL members in a group.
 * Useful for repairing corrupted data.
 *
 * @param tx - Prisma transaction client
 * @param groupId - Group ID to recalculate all balances in
 */
export async function recalculateAllGroupBalances(
  tx: TransactionClient,
  groupId: string
): Promise<void> {
  const memberships = await tx.membership.findMany({
    where: { groupId },
    select: { userId: true },
  });

  for (const membership of memberships) {
    await recalculateUserBalance(tx, membership.userId, groupId);
  }
}
