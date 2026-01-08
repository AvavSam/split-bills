import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { computeGroupBalances } from '@/lib/settlement';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    // Check membership
    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        memberships: {
          include: { user: true },
        },
        expenses: { include: { shares: true } },
        payments: true,
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Compute balances
    const balances = await computeGroupBalances(groupId, prisma);

    return NextResponse.json({
      ...group,
      balances: Object.fromEntries(balances),
    });
  } catch (error) {
    console.error("Get group error:", error);
    return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;

    // 1. Check if user is admin
    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.userId, groupId } },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ error: "Only admins can delete groups" }, { status: 403 });
    }

    // 2. Check for unsettled debts (non-zero netBalance)
    // We check all memberships in the group
    const unsettledMembers = await prisma.membership.count({
      where: {
        groupId,
        netBalance: { not: 0 },
      },
    });

    if (unsettledMembers > 0) {
      return NextResponse.json({ error: "Cannot delete group: All debts must be settled first" }, { status: 400 });
    }

    // 3. Delete group
    await prisma.group.delete({
      where: { id: groupId },
    });

    return NextResponse.json({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("Delete group error:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}

// Rename group
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: groupId } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Valid group name is required" }, { status: 400 });
    }

    // Check membership and role
    const membership = await prisma.membership.findUnique({
      where: {
        userId_groupId: { userId: user.userId, groupId },
      },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: { name: name.trim() },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        groupId,
        actorId: user.userId,
        type: "group.renamed",
        payload: { newName: name.trim() },
      },
    });

    return NextResponse.json(updatedGroup);
  } catch (error) {
    console.error("Update group error:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}
