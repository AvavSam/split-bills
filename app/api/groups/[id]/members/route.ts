import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    const members = await prisma.membership.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Get members error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

// Add user to group by email
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    // Check if current user is admin
    const adminMembership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!adminMembership || adminMembership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already a member
    const existing = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: targetUser.id, groupId },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "User is already a member" }, { status: 400 });
    }

    const membership = await prisma.membership.create({
      data: {
        userId: targetUser.id,
        groupId,
      },
      include: { user: true },
    });

    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    console.error("Add member error:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// Remove member from group
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;
    const body = await request.json();
    const { memberId } = body;

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    // Check if requester is admin
    const requesterMembership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // Check if trying to remove self
    if (memberId === user.userId) {
      return NextResponse.json({ error: "Cannot remove yourself from the group" }, { status: 400 });
    }

    // Check target membership status
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: memberId, groupId },
      },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Check Balance
    if (!targetMembership.netBalance.isZero()) {
      const balance = targetMembership.netBalance.toNumber();
      const msg = balance > 0 ? `Cannot remove member. They are owed ${balance.toFixed(2)}.` : `Cannot remove member. They owe ${Math.abs(balance).toFixed(2)}.`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Proceed with deletion and logging
    await prisma.$transaction([
      prisma.membership.delete({
        where: {
          userId_groupId: { userId: memberId, groupId },
        },
      }),
      prisma.activityLog.create({
        data: {
          groupId,
          actorId: user.userId,
          type: "member.removed",
          payload: { targetUserId: memberId },
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete member error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
