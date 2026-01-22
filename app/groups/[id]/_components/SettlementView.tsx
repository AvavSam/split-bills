"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Settlement {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

// Generate unique key for a settlement
function getSettlementKey(s: Settlement): string {
  return `${s.fromId}-${s.toId}-${s.amount}`;
}

export default function SettlementView({ groupId, currency, currentUserId }: { groupId: string; currency: string; currentUserId: string }) {
  const router = useRouter();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which specific settlement is being processed (by key)
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  // Use ref to prevent double-click race condition
  const processingRef = useRef<Set<string>>(new Set());

  const fetchSettlements = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/settlements`);
      if (res.ok) {
        const data = await res.json();
        setSettlements(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  const handleSettle = async (settlement: Settlement) => {
    const key = getSettlementKey(settlement);

    // Double-click protection using ref (synchronous check)
    if (processingRef.current.has(key)) {
      return; // Already processing this settlement
    }

    if (!confirm(`Record payment of ${settlement.amount} ${currency} from ${settlement.fromName} to ${settlement.toName}?`)) return;

    // Mark as processing IMMEDIATELY (before any async operation)
    processingRef.current.add(key);
    setProcessingKey(key);

    try {
      const res = await fetch(`/api/groups/${groupId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromId: settlement.fromId,
          toId: settlement.toId,
          amount: settlement.amount.toString(),
          note: "Settlement",
        }),
      });

      if (res.ok) {
        // Let router.refresh() handle the update - no optimistic update needed
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to record payment");
      }
    } catch (error) {
      console.error(error);
      alert("Network error occurred");
    } finally {
      // Clean up processing state
      processingRef.current.delete(key);
      setProcessingKey(null);
    }
  };

  const mySettlements = settlements.filter((s) => s.fromId === currentUserId);

  if (loading) return <div className="text-center py-8">Loading suggested transfers...</div>;

  if (mySettlements.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <p className="text-zinc-500">You don&apos;t have any pending settlements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Suggested Transfers</h3>
      {mySettlements.map((s) => {
        const key = getSettlementKey(s);
        const isProcessing = processingKey === key;

        return (
          <div key={key} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm gap-4">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-medium text-gray-900 dark:text-white">{s.fromName}</span>
                <span className="text-xs text-gray-500">pays</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="hidden sm:block w-5 h-5 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <div className="flex flex-col sm:items-end">
                <span className="font-medium text-gray-900 dark:text-white">{s.toName}</span>
                <span className="text-xs text-gray-500 hidden sm:inline">&nbsp;</span>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(s.amount)}</span>
              <button
                onClick={() => handleSettle(s)}
                disabled={isProcessing || processingKey !== null}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isProcessing ? "Processing..." : "Mark Paid"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
