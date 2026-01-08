import { PrismaClient } from '@/generated/prisma/client';
import Decimal from 'decimal.js';

export interface Settlement {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: Decimal;
}

export interface UserBalance {
  userId: string;
  name: string;
  balance: Decimal; // positive = owed money; negative = owes money
}

/**
 * Greedy settlement algorithm: match creditors (positive balance)
 * with debtors (negative balance). O(n) iterations, O(n) debtors + creditors.
 */
export function calculateSettlements(
  userBalances: UserBalance[]
): Settlement[] {
  const settlements: Settlement[] = [];

  // Separate into creditors and debtors
  const creditors = userBalances
    .filter((ub) => ub.balance.isPositive())
    .sort((a, b) => b.balance.cmp(a.balance)); // descending

  const debtors = userBalances
    .filter((ub) => ub.balance.isNegative())
    .map((ub) => ({ ...ub, balance: ub.balance.negated() })) // convert to positive
    .sort((a, b) => b.balance.cmp(a.balance)); // descending

  let creditorIdx = 0;
  let debtorIdx = 0;

  while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
    const creditor = creditors[creditorIdx];
    const debtor = debtors[debtorIdx];

    const transferAmount = Decimal.min(creditor.balance, debtor.balance);

    settlements.push({
      fromUserId: debtor.userId,
      fromUserName: debtor.name,
      toUserId: creditor.userId,
      toUserName: creditor.name,
      amount: transferAmount,
    });

    creditor.balance = creditor.balance.minus(transferAmount);
    debtor.balance = debtor.balance.minus(transferAmount);

    // Move to next if balance is settled (approximately zero)
    if (creditor.balance.lessThanOrEqualTo(new Decimal('0.01'))) {
      creditorIdx++;
    }
    if (debtor.balance.lessThanOrEqualTo(new Decimal('0.01'))) {
      debtorIdx++;
    }
  }

  return settlements;
}

/**
 * Compute net balances for all users in a group
 * net[user] = total_paid_by_user - total_share_of_user
 */
export async function computeGroupBalances(
  groupId: string,
  prisma: PrismaClient
): Promise<Map<string, Decimal>> {
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      shares: true,
      payer: true,
    },
  });

  const payments = await prisma.payment.findMany({
    where: { groupId },
  });

  const balances = new Map<string, Decimal>();

  // Process expenses
  for (const expense of expenses) {
    const amount = new Decimal(expense.totalAmount.toString());

    // Payer paid full amount
    const payerBalance = balances.get(expense.payerId) ?? new Decimal(0);
    balances.set(expense.payerId, payerBalance.plus(amount));

    // Deduct each share
    for (const share of expense.shares) {
      const shareAmount = new Decimal(share.shareAmount.toString());
      const userBalance = balances.get(share.userId) ?? new Decimal(0);
      balances.set(share.userId, userBalance.minus(shareAmount));
    }
  }

  // Process payments
  for (const payment of payments) {
    const amount = new Decimal(payment.amount.toString());
    const fromBalance = balances.get(payment.fromId) ?? new Decimal(0);
    const toBalance = balances.get(payment.toId) ?? new Decimal(0);

    balances.set(payment.fromId, fromBalance.plus(amount));
    balances.set(payment.toId, toBalance.minus(amount));
  }

  return balances;
}
