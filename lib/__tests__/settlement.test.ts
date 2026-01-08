import { calculateSettlements, UserBalance } from '../settlement';
import Decimal from 'decimal.js';

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
