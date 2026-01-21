"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditExpenseModal from "./EditExpenseModal";
import PayShareModal from "./PayShareModal";

interface Share {
  userName: string | null;
  userId: string;
  amount: number;
}

interface Activity {
  type: "EXPENSE" | "PAYMENT";
  id: string;
  date: Date | string;
  title: string;
  amount: number;
  currency: string;
  payerName: string | null;
  payerId: string;
  receiverName?: string | null;
  shares: Share[];
}

interface Member {
  id: string;
  userId: string;
  role: string;
  user: {
    name: string | null;
    email: string;
  };
}

interface ActivityListProps {
  activities: Activity[];
  members: Member[];
  currentUserId: string;
  groupId: string;
  currency: string;
}

export default function ActivityList({
  activities,
  members,
  currentUserId,
  groupId,
  currency,
}: ActivityListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Activity | null>(null);
  const [payingShare, setPayingShare] = useState<{
    expenseId: string;
    expenseTitle: string;
    payerId: string;
    payerName: string | null;
    shareUserId: string;
    shareUserName: string | null;
    amount: number;
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleDelete = async (expenseId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus expense ini?")) return;

    setDeletingId(expenseId);
    try {
      const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menghapus expense");
      }

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan";
      alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePayShare = (
    activity: Activity,
    share: Share
  ) => {
    setPayingShare({
      expenseId: activity.id,
      expenseTitle: activity.title,
      payerId: activity.payerId,
      payerName: activity.payerName,
      shareUserId: share.userId,
      shareUserName: share.userName,
      amount: share.amount,
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount);

  return (
    <>
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-gray-500 italic">Belum ada aktivitas tercatat.</p>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800"
            >
              <div className="flex justify-between items-center p-4">
                <div className="flex gap-4 items-center">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      activity.type === "EXPENSE"
                        ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                        : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {activity.type === "EXPENSE" ? activity.title.charAt(0).toUpperCase() : "$"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {activity.type === "EXPENSE" ? activity.title : `Paid to ${activity.receiverName}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {activity.payerId === currentUserId ? "You" : activity.payerName}{" "}
                      {activity.type === "EXPENSE" ? "paid" : "sent"}{" "}
                      {new Date(activity.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p
                      className={`font-bold ${
                        activity.type === "PAYMENT"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {formatCurrency(activity.amount)}
                    </p>
                  </div>

                  {/* Action Menu for Expenses */}
                  {activity.type === "EXPENSE" && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === activity.id ? null : activity.id)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        disabled={deletingId === activity.id}
                      >
                        {deletingId === activity.id ? (
                          <svg
                            className="animate-spin h-5 w-5 text-gray-500"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5 text-gray-500"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                            />
                          </svg>
                        )}
                      </button>

                      {openMenuId === activity.id && (
                        <>
                          {/* Backdrop to close menu */}
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[120px]">
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                setEditingExpense(activity);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="w-4 h-4"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                handleDelete(activity.id);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="w-4 h-4"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                />
                              </svg>
                              Hapus
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Shares with Pay button */}
              {activity.type === "EXPENSE" && activity.shares && activity.shares.length > 0 && (
                <div className="px-4 pb-4 pt-0">
                  <div className="text-xs text-gray-500 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg space-y-2">
                    {activity.shares.map((share) => {
                      // Show Pay button if:
                      // 1. Current user is the share owner (can pay their own portion)
                      // 2. Current user is the payer (can confirm someone paid them)
                      // Don't show Pay for payer's own share (they don't owe themselves)
                      const canPay =
                        share.userId !== activity.payerId &&
                        (share.userId === currentUserId || activity.payerId === currentUserId);

                      return (
                        <div
                          key={share.userId}
                          className="flex items-center justify-between"
                        >
                          <span>
                            {share.userId === currentUserId ? "You" : share.userName} owes{" "}
                            {formatCurrency(share.amount)}
                          </span>
                          {canPay && (
                            <button
                              onClick={() => handlePayShare(activity, share)}
                              className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit Expense Modal */}
      {editingExpense && (
        <EditExpenseModal
          groupId={groupId}
          currency={currency}
          members={members}
          currentUserId={currentUserId}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
        />
      )}

      {/* Pay Share Modal */}
      {payingShare && (
        <PayShareModal
          groupId={groupId}
          currency={currency}
          payerId={payingShare.payerId}
          payerName={payingShare.payerName}
          shareUserId={payingShare.shareUserId}
          shareUserName={payingShare.shareUserName}
          amount={payingShare.amount}
          expenseTitle={payingShare.expenseTitle}
          currentUserId={currentUserId}
          onClose={() => setPayingShare(null)}
        />
      )}
    </>
  );
}
