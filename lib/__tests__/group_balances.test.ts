
import { computeGroupBalances } from '../settlement';
import { PrismaClient } from '@/generated/prisma/client';
import Decimal from 'decimal.js';

// Mock Prisma
const mockPrisma = {
  expense: {
    findMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

describe('computeGroupBalances', () => {
  it('should correctly settle balances after payment', async () => {
    // 1. Setup: Alice pays 100, split equally between Alice and Bob.
    // Alice is Payer.
    // Alice share: 50. Bob share: 50.
    // Expected Net: Alice +50, Bob -50.
    const expenses = [
      {
        id: 'exp1',
        groupId: 'g1',
        totalAmount: new Decimal(100),
        payerId: 'alice',
        shares: [
          { userId: 'alice', shareAmount: new Decimal(50) },
          { userId: 'bob', shareAmount: new Decimal(50) },
        ],
      },
    ];

    // 2. Setup: Bob pays Alice 50.
    // Expected Net: Alice 0, Bob 0.
    const payments = [
      {
        id: 'pay1',
        groupId: 'g1',
        fromId: 'bob',
        toId: 'alice',
        amount: new Decimal(50),
      },
    ];

    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue(expenses);
    (mockPrisma.payment.findMany as jest.Mock).mockResolvedValue(payments);

    const balances = await computeGroupBalances('g1', mockPrisma);

    const aliceBalance = balances.get('alice') ?? new Decimal(0);
    const bobBalance = balances.get('bob') ?? new Decimal(0);

    expect(aliceBalance.toNumber()).toBe(0);
    expect(bobBalance.toNumber()).toBe(0);
  });
});
