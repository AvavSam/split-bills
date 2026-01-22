import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/jwt";
import { redirect } from "next/navigation";
import AddExpenseModal from "./_components/AddExpenseModal";
import SettlementView from "./_components/SettlementView";
import GroupSettingsModal from "./_components/GroupSettingsModal";
import InviteMemberModal from "./_components/InviteMemberModal";
import ActivityList from "./_components/ActivityList";

import Link from "next/link";


async function getGroupDetails(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      expenses: {
        orderBy: { date: "desc" },
        take: 20,
        include: {
          payer: { select: { name: true, email: true } },
          shares: {
            include: {
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
      // Include recent payments
      payments: {
        orderBy: { date: "desc" },
        take: 10,
        include: {
          from: { select: { name: true, email: true } },
          to: { select: { name: true, email: true } },
        },
      },
    },
  });
  return group;
}

export default async function GroupDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const group = await getGroupDetails(groupId);
  if (!group) return <div>Group not found</div>;

  // Verify membership
  const myMembership = group.memberships.find((m) => m.userId === user.userId);
  if (!myMembership) redirect("/groups");

  const myBalance = Number(myMembership.netBalance);

  // Transform memberships to plain objects for Client Component
  const plainMembers = group.memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    user: {
      name: m.user.name,
      email: m.user.email,
    },
  }));

  // Create a map of member balances for ActivityList to check who is debtor
  const memberBalances: Record<string, number> = {};
  group.memberships.forEach((m) => {
    memberBalances[m.userId] = Number(m.netBalance);
  });

  // Combine expenses and payments for the activity log
  // Using Date objects but they will be serialized when passed to client component
  const activities = [
    ...group.expenses.map((e) => ({
      type: "EXPENSE" as const,
      id: e.id,
      date: new Date(e.date),
      title: e.title,
      amount: Number(e.totalAmount),
      currency: e.currency,
      payerName: e.payer.name,
      payerId: e.payerId,
      shares: e.shares.map((s) => ({
        userName: s.user.name,
        userId: s.user.id,
        amount: Number(s.shareAmount),
        paidAt: s.paidAt ? s.paidAt.toISOString() : null,
      })),
    })),
    ...group.payments.map((p) => ({
      type: "PAYMENT" as const,
      id: p.id,
      date: new Date(p.date),
      title: "Payment",
      amount: Number(p.amount),
      currency: group.currency,
      payerName: p.from.name,
      payerId: p.fromId,
      receiverName: p.to.name,
      shares: [] as { userName: string | null; userId: string; amount: number; paidAt: string | null }[],
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 md:p-8 pb-24">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-2">
          <Link href="/groups" className="text-sm text-indigo-500 hover:underline mb-2">
            &larr; Back to Groups
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{group.name}</h1>
              <p className="text-gray-500">Created on {new Date(group.createdAt).toLocaleDateString()}</p>
            </div>

            <div className="flex items-center gap-2">
              <InviteMemberModal groupId={groupId} />

              {myMembership.role === "admin" && <GroupSettingsModal groupId={groupId} groupName={group.name} members={plainMembers} currentUserId={user.userId} />}
            </div>
          </div>
        </header>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-6 bg-indigo-600 rounded-2xl text-white shadow-lg">
            <p className="text-indigo-100 text-sm font-medium">Your Net Balance</p>
            <p className="text-3xl font-bold mt-1">{new Intl.NumberFormat("id-ID", { style: "currency", currency: group.currency }).format(myBalance)}</p>
            <p className="text-indigo-200 text-sm mt-2">{myBalance > 0 ? "You are owed" : myBalance < 0 ? "You owe" : "All settled"}</p>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Group Expenses</p>
            <p className="text-3xl font-bold mt-1 text-gray-900 dark:text-white">
              {/* Simple sum for display */}
              {new Intl.NumberFormat("id-ID", { style: "currency", currency: group.currency }).format(group.expenses.reduce((acc, curr) => acc + Number(curr.totalAmount), 0))}
            </p>
            <p className="text-gray-400 text-sm mt-2">Current cycle</p>
          </div>
        </div>

        {/* Main Content Tabs (Simplified as Stack for MVP) */}
        <div className="space-y-8">
          {/* Recent Expenses List */}
          <section>
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Recent Activity</h2>
            <ActivityList activities={activities} members={plainMembers} currentUserId={user.userId} memberBalances={memberBalances} groupId={groupId} currency={group.currency} />
          </section>

          {/* Settlements */}
          <section>
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Settlements</h2>
            <SettlementView groupId={groupId} currency={group.currency} currentUserId={user.userId} />
          </section>
        </div>
      </div>

      <AddExpenseModal groupId={groupId} currency={group.currency} members={plainMembers} currentUserId={user.userId} />
    </div>
  );
}
