import { calculateSettlements, UserBalance, Settlement } from '../settlement';
import Decimal from 'decimal.js';

// ============================================
// HELPER FUNCTIONS FOR VERIFICATION
// ============================================

interface Bill {
  payerId: string;
  payerName: string;
  totalAmount: number;
  shares: { userId: string; name: string; amount: number }[];
}

/**
 * Compute net balances from multiple bills
 * net[user] = total_paid - total_share
 */
function computeNetBalancesFromBills(bills: Bill[]): UserBalance[] {
  const balanceMap = new Map<string, { name: string; balance: Decimal }>();

  for (const bill of bills) {
    // Payer gets +totalAmount
    const payerEntry = balanceMap.get(bill.payerId) ?? {
      name: bill.payerName,
      balance: new Decimal(0),
    };
    payerEntry.balance = payerEntry.balance.plus(bill.totalAmount);
    balanceMap.set(bill.payerId, payerEntry);

    // Each share holder gets -shareAmount
    for (const share of bill.shares) {
      const userEntry = balanceMap.get(share.userId) ?? {
        name: share.name,
        balance: new Decimal(0),
      };
      userEntry.balance = userEntry.balance.minus(share.amount);
      balanceMap.set(share.userId, userEntry);
    }
  }

  return Array.from(balanceMap.entries()).map(([userId, data]) => ({
    userId,
    name: data.name,
    balance: data.balance,
  }));
}

/**
 * Clone balances to avoid mutation issues
 */
function cloneBalances(balances: UserBalance[]): UserBalance[] {
  return balances.map((ub) => ({
    userId: ub.userId,
    name: ub.name,
    balance: new Decimal(ub.balance),
  }));
}

/**
 * Run calculateSettlements with cloned input to preserve original balances
 */
function runSettlements(balances: UserBalance[]): {
  originalBalances: UserBalance[];
  settlements: Settlement[];
} {
  const originalBalances = cloneBalances(balances);
  const workingBalances = cloneBalances(balances);
  const settlements = calculateSettlements(workingBalances);
  return { originalBalances, settlements };
}

/**
 * Verify settlements satisfy all invariants:
 * 1. Total received by each creditor = their initial positive balance
 * 2. Total paid by each debtor = their initial negative balance (absolute)
 * 3. Net balance after all settlements = 0
 */
function verifySettlements(
  originalBalances: UserBalance[],
  settlements: Settlement[]
): {
  valid: boolean;
  errors: string[];
  totalReceived: Map<string, Decimal>;
  totalPaid: Map<string, Decimal>;
} {
  const errors: string[] = [];
  const totalReceived = new Map<string, Decimal>();
  const totalPaid = new Map<string, Decimal>();

  // Calculate totals from settlements
  for (const s of settlements) {
    const received = totalReceived.get(s.toUserId) ?? new Decimal(0);
    totalReceived.set(s.toUserId, received.plus(s.amount));

    const paid = totalPaid.get(s.fromUserId) ?? new Decimal(0);
    totalPaid.set(s.fromUserId, paid.plus(s.amount));
  }

  // Verify creditors receive their full balance
  for (const ub of originalBalances) {
    if (ub.balance.isPositive()) {
      const received = totalReceived.get(ub.userId) ?? new Decimal(0);
      // Allow small rounding difference (0.01)
      if (received.minus(ub.balance).abs().greaterThan(0.01)) {
        errors.push(
          `Creditor ${ub.name} should receive ${ub.balance}, got ${received}`
        );
      }
    }
  }

  // Verify debtors pay their full balance
  for (const ub of originalBalances) {
    if (ub.balance.isNegative()) {
      const paid = totalPaid.get(ub.userId) ?? new Decimal(0);
      const expectedPay = ub.balance.negated();
      // Allow small rounding difference (0.01)
      if (paid.minus(expectedPay).abs().greaterThan(0.01)) {
        errors.push(
          `Debtor ${ub.name} should pay ${expectedPay}, paid ${paid}`
        );
      }
    }
  }

  // Verify sum of all balances is approximately zero
  const totalBalance = originalBalances.reduce(
    (sum, ub) => sum.plus(ub.balance),
    new Decimal(0)
  );
  if (totalBalance.abs().greaterThan(0.01)) {
    errors.push(`Total balance should be 0, got ${totalBalance}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    totalReceived,
    totalPaid,
  };
}

/**
 * Apply settlements to balances and verify everyone ends up at zero
 */
function verifyNetZeroAfterSettlements(
  originalBalances: UserBalance[],
  settlements: Settlement[]
): boolean {
  // Use original balances (not mutated)
  const finalBalances = new Map<string, Decimal>();
  for (const ub of originalBalances) {
    finalBalances.set(ub.userId, new Decimal(ub.balance));
  }

  // Apply settlements
  for (const s of settlements) {
    const fromBalance = finalBalances.get(s.fromUserId) ?? new Decimal(0);
    const toBalance = finalBalances.get(s.toUserId) ?? new Decimal(0);
    finalBalances.set(s.fromUserId, fromBalance.plus(s.amount));
    finalBalances.set(s.toUserId, toBalance.minus(s.amount));
  }

  // Check all approximately zero
  for (const [, balance] of finalBalances) {
    if (balance.abs().greaterThan(0.01)) {
      return false;
    }
  }
  return true;
}

// ============================================
// EXISTING TESTS
// ============================================

describe('Settlement Algorithm', () => {
  it('should handle simple equal split', () => {
    const balances: UserBalance[] = [
      { userId: '1', name: 'Alice', balance: new Decimal('100') },
      { userId: '2', name: 'Bob', balance: new Decimal('-100') },
    ];

    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toEqual({
      fromUserId: '2',
      fromUserName: 'Bob',
      toUserId: '1',
      toUserName: 'Alice',
      amount: new Decimal('100'),
    });
  });

  it('should match largest creditor with largest debtor', () => {
    const balances: UserBalance[] = [
      { userId: '1', name: 'Alice', balance: new Decimal('150') },
      { userId: '2', name: 'Bob', balance: new Decimal('-100') },
      { userId: '3', name: 'Charlie', balance: new Decimal('-50') },
    ];

    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(2);
    expect(settlements[0].amount).toEqual(new Decimal('100'));
    expect(settlements[1].amount).toEqual(new Decimal('50'));
  });

  it('should handle zero balances', () => {
    const balances: UserBalance[] = [
      { userId: '1', name: 'Alice', balance: new Decimal('0') },
      { userId: '2', name: 'Bob', balance: new Decimal('100') },
      { userId: '3', name: 'Charlie', balance: new Decimal('-100') },
    ];

    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].toUserId).toBe('2');
    expect(settlements[0].fromUserId).toBe('3');
  });

  it('should handle rounding errors (< 0.01)', () => {
    const balances: UserBalance[] = [
      { userId: '1', name: 'Alice', balance: new Decimal('99.99') },
      { userId: '2', name: 'Bob', balance: new Decimal('-99.99') },
    ];

    const settlements = calculateSettlements(balances);

    expect(settlements).toHaveLength(1);
  });
});

// ============================================
// 3+ PERSON SCENARIOS
// ============================================

describe('3+ Person Scenarios', () => {
  it('should handle one payer covers everyone (3 people)', () => {
    // Scenario: Alice bayar makan malam 300k untuk 3 orang, split sama rata
    // Alice: +300 - 100 = +200 (creditor)
    // Bob: -100 (debtor)
    // Charlie: -100 (debtor)
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('200') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('-100') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('-100') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify settlements
    expect(settlements).toHaveLength(2);

    // Both Bob and Charlie should pay Alice
    const bobPayment = settlements.find((s) => s.fromUserId === 'bob');
    const charliePayment = settlements.find((s) => s.fromUserId === 'charlie');

    expect(bobPayment).toBeDefined();
    expect(bobPayment!.toUserId).toBe('alice');
    expect(bobPayment!.amount).toEqual(new Decimal('100'));

    expect(charliePayment).toBeDefined();
    expect(charliePayment!.toUserId).toBe('alice');
    expect(charliePayment!.amount).toEqual(new Decimal('100'));

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should handle multiple creditors and multiple debtors (4 people)', () => {
    // Alice: +200 (creditor besar)
    // Bob: +100 (creditor kecil)
    // Charlie: -150 (debtor besar)
    // David: -150 (debtor besar)
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('200') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('100') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('-150') },
      { userId: 'david', name: 'David', balance: new Decimal('-150') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);

    // Alice should receive exactly 200
    expect(verification.totalReceived.get('alice')).toEqual(new Decimal('200'));
    // Bob should receive exactly 100
    expect(verification.totalReceived.get('bob')).toEqual(new Decimal('100'));
    // Charlie should pay exactly 150
    expect(verification.totalPaid.get('charlie')).toEqual(new Decimal('150'));
    // David should pay exactly 150
    expect(verification.totalPaid.get('david')).toEqual(new Decimal('150'));

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should minimize transactions with greedy algorithm', () => {
    // 5 people scenario
    // A: +300, B: +200, C: -200, D: -150, E: -150
    const balances: UserBalance[] = [
      { userId: 'a', name: 'A', balance: new Decimal('300') },
      { userId: 'b', name: 'B', balance: new Decimal('200') },
      { userId: 'c', name: 'C', balance: new Decimal('-200') },
      { userId: 'd', name: 'D', balance: new Decimal('-150') },
      { userId: 'e', name: 'E', balance: new Decimal('-150') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Greedy should produce efficient settlements
    // Max possible transactions = min(creditors, debtors) + excess = 4
    // But greedy should minimize it
    expect(settlements.length).toBeLessThanOrEqual(4);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });
});

// ============================================
// MULTIPLE BILLS OVERLAPPING SCENARIOS
// ============================================

describe('Multiple Bills Overlapping', () => {
  it('should correctly compute net balances from multiple bills', () => {
    // Bill 1: A bayar 300k, shares: A(50k), B(100k), C(80k), D(70k)
    // Bill 2: B bayar 240k, shares: A(80k), B(60k), C(50k), D(50k)
    // Bill 3: C bayar 150k, shares: A(40k), B(40k), C(30k), D(40k)
    const bills: Bill[] = [
      {
        payerId: 'a',
        payerName: 'A',
        totalAmount: 300,
        shares: [
          { userId: 'a', name: 'A', amount: 50 },
          { userId: 'b', name: 'B', amount: 100 },
          { userId: 'c', name: 'C', amount: 80 },
          { userId: 'd', name: 'D', amount: 70 },
        ],
      },
      {
        payerId: 'b',
        payerName: 'B',
        totalAmount: 240,
        shares: [
          { userId: 'a', name: 'A', amount: 80 },
          { userId: 'b', name: 'B', amount: 60 },
          { userId: 'c', name: 'C', amount: 50 },
          { userId: 'd', name: 'D', amount: 50 },
        ],
      },
      {
        payerId: 'c',
        payerName: 'C',
        totalAmount: 150,
        shares: [
          { userId: 'a', name: 'A', amount: 40 },
          { userId: 'b', name: 'B', amount: 40 },
          { userId: 'c', name: 'C', amount: 30 },
          { userId: 'd', name: 'D', amount: 40 },
        ],
      },
    ];

    const balances = computeNetBalancesFromBills(bills);

    // Expected: A: +130, B: +40, C: -10, D: -160
    const aBalance = balances.find((b) => b.userId === 'a')!.balance;
    const bBalance = balances.find((b) => b.userId === 'b')!.balance;
    const cBalance = balances.find((b) => b.userId === 'c')!.balance;
    const dBalance = balances.find((b) => b.userId === 'd')!.balance;

    expect(aBalance).toEqual(new Decimal('130'));
    expect(bBalance).toEqual(new Decimal('40'));
    expect(cBalance).toEqual(new Decimal('-10'));
    expect(dBalance).toEqual(new Decimal('-160'));

    // Verify total sum is zero
    const total = aBalance.plus(bBalance).plus(cBalance).plus(dBalance);
    expect(total).toEqual(new Decimal('0'));
  });

  it('should offset debts when same person pays later (B becomes creditor)', () => {
    // After Bill 1: B owes A 100k
    // After Bill 2: B paid 240k, now B is creditor
    // Key insight: B no longer pays A anything!
    const bills: Bill[] = [
      {
        payerId: 'a',
        payerName: 'A',
        totalAmount: 300,
        shares: [
          { userId: 'a', name: 'A', amount: 50 },
          { userId: 'b', name: 'B', amount: 100 },
          { userId: 'c', name: 'C', amount: 80 },
          { userId: 'd', name: 'D', amount: 70 },
        ],
      },
      {
        payerId: 'b',
        payerName: 'B',
        totalAmount: 240,
        shares: [
          { userId: 'a', name: 'A', amount: 80 },
          { userId: 'b', name: 'B', amount: 60 },
          { userId: 'c', name: 'C', amount: 50 },
          { userId: 'd', name: 'D', amount: 50 },
        ],
      },
      {
        payerId: 'c',
        payerName: 'C',
        totalAmount: 150,
        shares: [
          { userId: 'a', name: 'A', amount: 40 },
          { userId: 'b', name: 'B', amount: 40 },
          { userId: 'c', name: 'C', amount: 30 },
          { userId: 'd', name: 'D', amount: 40 },
        ],
      },
    ];

    const balances = computeNetBalancesFromBills(bills);
    const { originalBalances, settlements } = runSettlements(balances);

    // B should NOT pay anyone - B is now a creditor!
    const bPayments = settlements.filter((s) => s.fromUserId === 'b');
    expect(bPayments).toHaveLength(0);

    // B should RECEIVE money
    const bReceipts = settlements.filter((s) => s.toUserId === 'b');
    expect(bReceipts.length).toBeGreaterThan(0);

    // Total received by B should be 40
    const totalReceivedByB = bReceipts.reduce(
      (sum, s) => sum.plus(s.amount),
      new Decimal(0)
    );
    expect(totalReceivedByB).toEqual(new Decimal('40'));

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should handle 3 bills with exact expected settlements', () => {
    // Same scenario as above, verify exact settlement transactions
    const balances: UserBalance[] = [
      { userId: 'a', name: 'A', balance: new Decimal('130') },
      { userId: 'b', name: 'B', balance: new Decimal('40') },
      { userId: 'c', name: 'C', balance: new Decimal('-10') },
      { userId: 'd', name: 'D', balance: new Decimal('-160') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Expected settlements (greedy descending):
    // Creditors sorted: A(130), B(40)
    // Debtors sorted: D(160), C(10)
    // 1. D → A: 130 (A settled, D sisa 30)
    // 2. D → B: 30 (D settled, B sisa 10)
    // 3. C → B: 10 (C settled, B settled)

    expect(settlements).toHaveLength(3);

    // First settlement: D pays A 130
    expect(settlements[0].fromUserId).toBe('d');
    expect(settlements[0].toUserId).toBe('a');
    expect(settlements[0].amount).toEqual(new Decimal('130'));

    // Second settlement: D pays B 30
    expect(settlements[1].fromUserId).toBe('d');
    expect(settlements[1].toUserId).toBe('b');
    expect(settlements[1].amount).toEqual(new Decimal('30'));

    // Third settlement: C pays B 10
    expect(settlements[2].fromUserId).toBe('c');
    expect(settlements[2].toUserId).toBe('b');
    expect(settlements[2].amount).toEqual(new Decimal('10'));

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should minimize number of transactions via greedy matching', () => {
    // Without greedy optimization, we might need many transactions
    // With greedy, we minimize the number
    const balances: UserBalance[] = [
      { userId: 'a', name: 'A', balance: new Decimal('130') },
      { userId: 'b', name: 'B', balance: new Decimal('40') },
      { userId: 'c', name: 'C', balance: new Decimal('-10') },
      { userId: 'd', name: 'D', balance: new Decimal('-160') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Only 3 transactions needed for 4 people with complex debts
    expect(settlements).toHaveLength(3);

    // Verify correctness
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);
  });
});

// ============================================
// REAL-WORLD TRIP SCENARIO
// ============================================

describe('Real-World Trip Scenario', () => {
  it('should handle trip with multiple expenses split equally', () => {
    // Alice bayar hotel: 600k
    // Bob bayar makan: 300k
    // Charlie bayar transport: 150k
    // David tidak bayar apapun
    // Total: 1,050k, split 4 = 262.5k per orang

    const bills: Bill[] = [
      {
        payerId: 'alice',
        payerName: 'Alice',
        totalAmount: 600,
        shares: [
          { userId: 'alice', name: 'Alice', amount: 150 },
          { userId: 'bob', name: 'Bob', amount: 150 },
          { userId: 'charlie', name: 'Charlie', amount: 150 },
          { userId: 'david', name: 'David', amount: 150 },
        ],
      },
      {
        payerId: 'bob',
        payerName: 'Bob',
        totalAmount: 300,
        shares: [
          { userId: 'alice', name: 'Alice', amount: 75 },
          { userId: 'bob', name: 'Bob', amount: 75 },
          { userId: 'charlie', name: 'Charlie', amount: 75 },
          { userId: 'david', name: 'David', amount: 75 },
        ],
      },
      {
        payerId: 'charlie',
        payerName: 'Charlie',
        totalAmount: 150,
        shares: [
          { userId: 'alice', name: 'Alice', amount: 37.5 },
          { userId: 'bob', name: 'Bob', amount: 37.5 },
          { userId: 'charlie', name: 'Charlie', amount: 37.5 },
          { userId: 'david', name: 'David', amount: 37.5 },
        ],
      },
    ];

    const balances = computeNetBalancesFromBills(bills);

    // Expected net balances:
    // Alice: 600 - 150 - 75 - 37.5 = 337.5
    // Bob: 300 - 150 - 75 - 37.5 = 37.5
    // Charlie: 150 - 150 - 75 - 37.5 = -112.5
    // David: 0 - 150 - 75 - 37.5 = -262.5
    const aliceBalance = balances.find((b) => b.userId === 'alice')!.balance;
    const bobBalance = balances.find((b) => b.userId === 'bob')!.balance;
    const charlieBalance = balances.find((b) => b.userId === 'charlie')!.balance;
    const davidBalance = balances.find((b) => b.userId === 'david')!.balance;

    expect(aliceBalance.toNumber()).toBeCloseTo(337.5, 2);
    expect(bobBalance.toNumber()).toBeCloseTo(37.5, 2);
    expect(charlieBalance.toNumber()).toBeCloseTo(-112.5, 2);
    expect(davidBalance.toNumber()).toBeCloseTo(-262.5, 2);

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // David (biggest debtor) should pay the most
    const davidPayments = settlements.filter((s) => s.fromUserId === 'david');
    const totalDavidPaid = davidPayments.reduce(
      (sum, s) => sum.plus(s.amount),
      new Decimal(0)
    );
    expect(totalDavidPaid.toNumber()).toBeCloseTo(262.5, 2);

    // Alice (biggest creditor) should receive the most
    const aliceReceipts = settlements.filter((s) => s.toUserId === 'alice');
    const totalAliceReceived = aliceReceipts.reduce(
      (sum, s) => sum.plus(s.amount),
      new Decimal(0)
    );
    expect(totalAliceReceived.toNumber()).toBeCloseTo(337.5, 2);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge Cases', () => {
  it('should handle fractional amounts (100/3)', () => {
    // 100 split 3 ways = 33.333...
    const thirdAmount = new Decimal('100').dividedBy(3);

    const balances: UserBalance[] = [
      {
        userId: 'alice',
        name: 'Alice',
        balance: new Decimal('100').minus(thirdAmount),
      }, // 66.666...
      { userId: 'bob', name: 'Bob', balance: thirdAmount.negated() }, // -33.333...
      { userId: 'charlie', name: 'Charlie', balance: thirdAmount.negated() }, // -33.333...
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Both should pay Alice
    expect(settlements).toHaveLength(2);

    // Verify all invariants (allowing for small rounding)
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should handle very small amounts near threshold (0.01)', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('0.02') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('-0.02') },
    ];

    const { settlements } = runSettlements(balances);

    // Should still create settlement for amounts > 0.01
    expect(settlements).toHaveLength(1);
    expect(settlements[0].amount).toEqual(new Decimal('0.02'));
  });

  it('should handle amounts at exactly threshold (0.01)', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('0.01') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('-0.01') },
    ];

    const { settlements } = runSettlements(balances);

    // At threshold, should settle
    expect(settlements).toHaveLength(1);
  });

  it('should handle single debtor paying multiple creditors', () => {
    // David owes everyone
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('100') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('50') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('30') },
      { userId: 'david', name: 'David', balance: new Decimal('-180') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // David pays everyone
    expect(settlements.every((s) => s.fromUserId === 'david')).toBe(true);
    expect(settlements).toHaveLength(3);

    // Total paid by David = 180
    const totalPaid = settlements.reduce(
      (sum, s) => sum.plus(s.amount),
      new Decimal(0)
    );
    expect(totalPaid).toEqual(new Decimal('180'));

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);
  });

  it('should handle all balances being zero', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('0') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('0') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('0') },
    ];

    const { settlements } = runSettlements(balances);

    // No settlements needed
    expect(settlements).toHaveLength(0);
  });

  it('should handle single person (no settlement needed)', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('0') },
    ];

    const { settlements } = runSettlements(balances);

    expect(settlements).toHaveLength(0);
  });

  it('should handle large amounts correctly', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('1000000') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('500000') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('-750000') },
      { userId: 'david', name: 'David', balance: new Decimal('-750000') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });

  it('should handle many decimal places correctly', () => {
    const balances: UserBalance[] = [
      { userId: 'alice', name: 'Alice', balance: new Decimal('33.333333333') },
      { userId: 'bob', name: 'Bob', balance: new Decimal('16.666666667') },
      { userId: 'charlie', name: 'Charlie', balance: new Decimal('-50') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);

    // Verify net zero (with small tolerance)
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);
  });
});

// ============================================
// NET ZERO VERIFICATION
// ============================================

describe('Net Zero Verification', () => {
  it('should verify sum of creditor balances equals sum of debtor balances', () => {
    const balances: UserBalance[] = [
      { userId: 'a', name: 'A', balance: new Decimal('200') },
      { userId: 'b', name: 'B', balance: new Decimal('100') },
      { userId: 'c', name: 'C', balance: new Decimal('-150') },
      { userId: 'd', name: 'D', balance: new Decimal('-150') },
    ];

    const creditorSum = balances
      .filter((b) => b.balance.isPositive())
      .reduce((sum, b) => sum.plus(b.balance), new Decimal(0));

    const debtorSum = balances
      .filter((b) => b.balance.isNegative())
      .reduce((sum, b) => sum.plus(b.balance.negated()), new Decimal(0));

    expect(creditorSum).toEqual(debtorSum);
    expect(creditorSum).toEqual(new Decimal('300'));
  });

  it('should achieve net zero for complex 6-person scenario', () => {
    const balances: UserBalance[] = [
      { userId: 'a', name: 'A', balance: new Decimal('500') },
      { userId: 'b', name: 'B', balance: new Decimal('300') },
      { userId: 'c', name: 'C', balance: new Decimal('100') },
      { userId: 'd', name: 'D', balance: new Decimal('-400') },
      { userId: 'e', name: 'E', balance: new Decimal('-300') },
      { userId: 'f', name: 'F', balance: new Decimal('-200') },
    ];

    const { originalBalances, settlements } = runSettlements(balances);

    // Verify all invariants
    const verification = verifySettlements(originalBalances, settlements);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);

    // Verify net zero
    expect(verifyNetZeroAfterSettlements(originalBalances, settlements)).toBe(true);

    // Log settlements for debugging
    console.log('6-person settlements:');
    for (const s of settlements) {
      console.log(`  ${s.fromUserName} → ${s.toUserName}: ${s.amount}`);
    }
  });
});
