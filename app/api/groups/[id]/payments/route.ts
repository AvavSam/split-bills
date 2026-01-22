import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { CreatePaymentSchema, parseAmount } from '@/lib/validation';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payments = await prisma.payment.findMany({
      where: { groupId },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Get payments error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validated = CreatePaymentSchema.parse(body);

    const amount = parseAmount(validated.amount);

    // Check for duplicate payment within 10 seconds (protection against double-click)
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
    const recentDuplicatePayment = await prisma.payment.findFirst({
      where: {
        groupId,
        fromId: validated.fromId,
        toId: validated.toId,
        amount: amount,
        createdAt: {
          gte: tenSecondsAgo,
        },
      },
    });

    if (recentDuplicatePayment) {
      return NextResponse.json(
        { error: "Payment baru saja dicatat. Mohon tunggu beberapa detik." },
        { status: 409 }
      );
    }

    // Jika payment terkait dengan expense share tertentu, cek apakah sudah dibayar
    let existingShare = null;
    if (validated.expenseId && validated.shareUserId) {
      existingShare = await prisma.expenseShare.findUnique({
        where: {
          expenseId_userId: {
            expenseId: validated.expenseId,
            userId: validated.shareUserId,
          },
        },
      });

      if (!existingShare) {
        return NextResponse.json(
          { error: "Expense share tidak ditemukan" },
          { status: 404 }
        );
      }

      if (existingShare.paidAt) {
        return NextResponse.json(
          { error: "Share ini sudah dibayar sebelumnya" },
          { status: 400 }
        );
      }
    }

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
            netBalance: fromMembership.netBalance.plus(amount),
          },
        });
      }

      if (toMembership) {
        await tx.membership.update({
          where: { userId_groupId: { userId: validated.toId, groupId } },
          data: {
            netBalance: toMembership.netBalance.minus(amount),
          },
        });
      }

      // Update paidAt pada ExpenseShare jika payment terkait dengan expense
      if (validated.expenseId && validated.shareUserId) {
        await tx.expenseShare.update({
          where: {
            expenseId_userId: {
              expenseId: validated.expenseId,
              userId: validated.shareUserId,
            },
          },
          data: {
            paidAt: new Date(),
          },
        });
      }

      return newPayment;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    // Jika Prisma error, coba extract pesan yang lebih jelas
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string; message: string };
      console.error("Prisma error code:", prismaError.code);
      return NextResponse.json({ error: `Database error: ${prismaError.code}` }, { status: 500 });
    }
    const message = error instanceof Error ? error.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
