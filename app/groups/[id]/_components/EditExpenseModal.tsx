"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

interface Share {
  userName: string | null;
  userId: string;
  amount: number;
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  payerId: string;
  payerName: string | null;
  shares: Share[];
}

interface Member {
  id: string;
  userId: string;
  user: {
    name: string | null;
    email: string;
  };
}

interface EditExpenseModalProps {
  groupId: string;
  currency: string;
  members: Member[];
  currentUserId: string;
  expense: Expense;
  onClose: () => void;
}

export default function EditExpenseModal({
  groupId,
  currency,
  members,
  currentUserId,
  expense,
  onClose,
}: EditExpenseModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Form State
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [payerId, setPayerId] = useState(expense.payerId);
  const [splitMode, setSplitMode] = useState<"EQUAL" | "EXACT">("EXACT");

  // Participants selection (map userId to share details)
  const [participants, setParticipants] = useState<
    Record<string, { selected: boolean; amount: string }>
  >(() => {
    const initial: Record<string, { selected: boolean; amount: string }> = {};

    // Initialize all members as not selected
    members.forEach((m) => {
      initial[m.userId] = { selected: false, amount: "" };
    });

    // Set selected and amounts from existing shares
    expense.shares.forEach((share) => {
      initial[share.userId] = {
        selected: true,
        amount: share.amount.toString(),
      };
    });

    return initial;
  });

  // Detect if it was equal split originally
  useEffect(() => {
    if (expense.shares.length > 0) {
      const firstAmount = expense.shares[0].amount;
      const isEqual = expense.shares.every(
        (s) => Math.abs(s.amount - firstAmount) < 0.02
      );
      if (isEqual) {
        setSplitMode("EQUAL");
      }
    }
  }, [expense.shares]);

  const handleParticipantChange = (
    userId: string,
    field: "selected" | "amount",
    value: boolean | string
  ) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { selected: false, amount: "" }),
        [field]: value,
      },
    }));
  };

  const selectedUserIds = useMemo(
    () => Object.keys(participants).filter((uid) => participants[uid].selected),
    [participants]
  );

  // Calculations
  const calculatedTotals = useMemo(() => {
    const baseTotal = parseFloat(amount) || 0;
    const count = selectedUserIds.length;

    // Remaining to assign (for EXACT mode validation)
    const assignedAmount = selectedUserIds.reduce((sum, uid) => {
      const val = parseFloat(participants[uid].amount) || 0;
      return sum + val;
    }, 0);
    const remaining = baseTotal - assignedAmount;

    return {
      baseTotal,
      assignedAmount,
      remaining,
      count,
    };
  }, [amount, selectedUserIds, participants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (calculatedTotals.baseTotal <= 0) throw new Error("Invalid total amount");
      if (selectedUserIds.length === 0)
        throw new Error("Select at least one participant");

      if (splitMode === "EXACT") {
        if (Math.abs(calculatedTotals.remaining) > 0.02) {
          throw new Error(
            `Allocated amounts must equal ${calculatedTotals.baseTotal.toFixed(2)}`
          );
        }
      }

      // Calculate final shares logic
      const expenseParticipants = selectedUserIds.map((userId, index) => {
        let baseShare = 0;

        if (splitMode === "EQUAL") {
          const base =
            Math.floor((calculatedTotals.baseTotal / selectedUserIds.length) * 100) /
            100;
          baseShare = base;
          if (index === 0) {
            const remainder =
              calculatedTotals.baseTotal - base * selectedUserIds.length;
            baseShare += Math.round(remainder * 100) / 100;
          }
        } else {
          baseShare = parseFloat(participants[userId].amount) || 0;
        }

        return {
          userId,
          shareAmount: baseShare.toFixed(2),
        };
      });

      const res = await fetch(`/api/groups/${groupId}/expenses/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          totalAmount: calculatedTotals.baseTotal.toFixed(2),
          currency,
          payerId,
          participants: expenseParticipants,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update expense");
      }

      onClose();
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg p-6 border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">
          Edit Expense
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title & Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                placeholder="Dinner, Taxi..."
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount ({currency})
              </label>
              <input
                type="number"
                required
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Payer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Paid By
            </label>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
            >
              <option value={currentUserId}>You</option>
              {members
                .filter((m) => m.userId !== currentUserId)
                .map((member) => (
                  <option key={member.id} value={member.userId}>
                    {member.user.name || member.user.email}
                  </option>
                ))}
            </select>
          </div>

          {/* Split Mode Toggle */}
          <div className="flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setSplitMode("EQUAL")}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                splitMode === "EQUAL"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-700"
              }`}
            >
              Equal Split
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("EXACT")}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg border ${
                splitMode === "EXACT"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-700"
              }`}
            >
              Specific Amount
            </button>
          </div>

          {/* Participants */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Split With
              </label>
              {splitMode === "EXACT" && (
                <span
                  className={`text-xs font-mono ${
                    Math.abs(calculatedTotals.remaining) < 0.02
                      ? "text-green-600"
                      : "text-red-500"
                  }`}
                >
                  Remaining: {calculatedTotals.remaining.toFixed(2)} {currency}
                </span>
              )}
            </div>

            <div className="space-y-2 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 max-h-60 overflow-y-auto">
              {members.map((member) => {
                const isSelected = participants[member.userId]?.selected ?? false;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          handleParticipantChange(
                            member.userId,
                            "selected",
                            e.target.checked
                          )
                        }
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {member.userId === currentUserId
                          ? "You"
                          : member.user.name || member.user.email}
                      </span>
                    </div>
                    {isSelected && splitMode === "EXACT" && (
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={participants[member.userId]?.amount || ""}
                          onChange={(e) =>
                            handleParticipantChange(
                              member.userId,
                              "amount",
                              e.target.value
                            )
                          }
                          className="w-full text-right text-sm border-0 border-b border-gray-300 focus:border-indigo-500 focus:ring-0 bg-transparent py-1 px-0"
                        />
                      </div>
                    )}
                    {isSelected && splitMode === "EQUAL" && (
                      <span className="text-xs text-zinc-500">
                        ~{((calculatedTotals.baseTotal / selectedUserIds.length) || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total Summary */}
          <div className="text-xs text-zinc-500 flex justify-between px-1">
            <span>Total: {calculatedTotals.baseTotal.toFixed(2)} {currency}</span>
            <span>Participants: {selectedUserIds.length}</span>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
