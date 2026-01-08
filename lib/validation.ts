import { z } from 'zod';
import Decimal from 'decimal.js';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  currency: z.string().default('IDR'),
});

export const CreateExpenseSchema = z.object({
  title: z.string().min(1, "Expense title is required"),
  totalAmount: z.string().refine((val) => !isNaN(parseFloat(val)), "Must be a valid number"),
  taxAmount: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)), "Must be a valid number")
    .optional(),
  currency: z.string().default("IDR"),
  payerId: z.string().min(1, "Payer is required"),
  date: z.string().datetime().optional(),
  notes: z.string().optional(),
  participants: z.array(
    z.object({
      userId: z.string(),
      shareAmount: z.string(),
    })
  ),
  items: z
    .array(
      z.object({
        name: z.string(),
        price: z.string(),
        quantity: z.number().int().positive().default(1),
      })
    )
    .optional(),
});

export const CreatePaymentSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)), 'Must be a valid number'),
  note: z.string().optional(),
});

// Utility to parse and round Decimal amounts
export function parseAmount(value: string | number): Decimal {
  const decimal = new Decimal(value);
  // Round to 2 decimal places (half away from zero)
  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function formatAmount(decimal: Decimal): string {
  return decimal.toFixed(2);
}

type RegisterInput = z.infer<typeof RegisterSchema>;
type LoginInput = z.infer<typeof LoginSchema>;
type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

export type {
  RegisterInput,
  LoginInput,
  CreateGroupInput,
  CreateExpenseInput,
  CreatePaymentInput,
};
