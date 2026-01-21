"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PayShareModalProps {
  groupId: string;
  currency: string;
  payerId: string;
  payerName: string | null;
  shareUserId: string;
  shareUserName: string | null;
  amount: number;
  expenseTitle: string;
  currentUserId: string;
  onClose: () => void;
}

export default function PayShareModal({
  groupId,
  currency,
  payerId,
  payerName,
  shareUserId,
  shareUserName,
  amount,
  expenseTitle,
  currentUserId,
  onClose,
}: PayShareModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(amount.toString());

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(value);

  // Determine who is paying whom
  const isCurrentUserTheShareOwner = shareUserId === currentUserId;
  const fromId = shareUserId; // The person who owes
  const toId = payerId; // The person who paid the expense

  const fromName = isCurrentUserTheShareOwner ? "You" : shareUserName;
  const toName = payerId === currentUserId ? "you" : payerName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const parsedAmount = parseFloat(paymentAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Please enter a valid amount");
      }

      const res = await fetch(`/api/groups/${groupId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromId,
          toId,
          amount: parsedAmount.toFixed(2),
          note: `Payment for: ${expenseTitle}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record payment");
      }

      onClose();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      alert(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md p-6 border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
          Record Payment
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          For expense: <span className="font-medium">{expenseTitle}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">From</span>
              <span className="font-medium text-gray-900 dark:text-white">{fromName}</span>
            </div>
            <div className="flex justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-emerald-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
                />
              </svg>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">To</span>
              <span className="font-medium text-gray-900 dark:text-white">{toName}</span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount ({currency})
            </label>
            <div className="relative">
              <input
                type="number"
                required
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-lg font-semibold text-center"
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Original share amount: {formatCurrency(amount)}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
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
                  Processing...
                </span>
              ) : (
                "Confirm Payment"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
