"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, X, Loader2, User as UserIcon, Trash2 } from "lucide-react";

interface Member {
  id: string; // Membership ID
  userId: string;
  role: string;
  netBalance?: number | string; // Optional if not always fetched, but needed for delete check
  user: {
    name: string | null;
    email: string;
  };
}

interface GroupSettingsModalProps {
  groupId: string;
  currentUserId: string;
  groupName: string;
  members: Member[];
}

export default function GroupSettingsModal({
  groupId,
  currentUserId,
  groupName: initialGroupName,
  members,
}: GroupSettingsModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');

  // Rename state
  const [groupName, setGroupName] = useState(initialGroupName);
  const [isRenaming, setIsRenaming] = useState(false);

  // Member management state
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [errorRequests, setErrorRequests] = useState<string | null>(null);

  const currentMember = members.find((m) => m.userId === currentUserId);
  const isAdmin = currentMember?.role === "admin";
  const hasUnsettledDebts = members.some((m) => {
    // If netBalance isn't passed as prop, we assume 0 or handle it elsewhere.
    // Assuming the parent component passes balances or we fetch them.
    // For now, let's assume if it is NOT passed, we might block or better yet,
    // ensure the parent fetching logic includes it.
    // Based on `app/groups/[id]/page.tsx` or similar, we should check if balances are available.
    // In `app/groups/page.tsx`, we saw netBalance select.
    // Check `app/api/groups/[id]/route.ts` - it returns `balances` object.

    // Simplification: We rely on the API to double check, but for UI disabled state:
    // If we don't have balance data, we might optimistically allow click and let API fail.
    // But let's check `netBalance` from `Member` interface we just updated.
    return Number(m.netBalance || 0) !== 0;
  });

  const handleDeleteGroup = async () => {
    if (!confirm("Are you sure? This cannot be undone.")) return;

    setDeletingGroup(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete group");
      }
      router.push("/groups");
      router.refresh();
    } catch (error) {
      setErrorRequests(
        error instanceof Error ? error.message : "Failed to delete group"
      );
      setDeletingGroup(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRenaming(true);
    setErrorRequests(null);
    try {
        const res = await fetch(`/api/groups/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: groupName })
        });
        if (!res.ok) {
            const data = await res.json();
             throw new Error(data.error || "Failed to rename group");
        }
        setIsOpen(false);
        router.refresh();
    } catch (err) {
        setErrorRequests(err instanceof Error ? err.message : "An error occurred");
    } finally {
        setIsRenaming(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
      if(!confirm("Are you sure you want to remove this member? This action logs the removal.")) return;

      setRemovingMemberId(targetUserId);
      setErrorRequests(null);
      try {
          const res = await fetch(`/api/groups/${groupId}/members`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId: targetUserId })
          });
          const data = await res.json();
          if (!res.ok) {
              throw new Error(data.error || "Failed to remove member");
          }
          router.refresh();
      } catch (err) {
          setErrorRequests(err instanceof Error ? err.message : "An error occurred");
      } finally {
          setRemovingMemberId(null);
      }
  }


  // Allow reopening if group name changed externally (though router.refresh handles this map mostly)
  // We don't sync props to state for groupName unless open

  if (!isOpen) {
      return (
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title="Group Settings"
          >
              <Settings className="w-5 h-5" />
          </button>
      );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col border border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Group Settings</h2>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
            </button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-zinc-800">
            <button
                className={`flex-1 p-3 font-medium ${activeTab === 'general' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                onClick={() => setActiveTab('general')}
            >
                General
            </button>
            <button
                className={`flex-1 p-3 font-medium ${activeTab === 'members' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                onClick={() => setActiveTab('members')}
            >
                Members Management
            </button>
        </div>


        <div className="p-4 overflow-y-auto flex-1">
            {errorRequests && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm">
                    {errorRequests}
                </div>
            )}

            {activeTab === 'general' && (
                <form onSubmit={handleRename} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name</label>
                        <input
                            type="text"
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                            placeholder="Enter group name"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isRenaming || !groupName.trim() || groupName === initialGroupName}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex justify-center items-center gap-2"
                    >
                        {isRenaming && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isRenaming ? "Saving..." : "Save Changes"}
                    </button>
                </form>
            )}

            {activeTab === 'general' && isAdmin && (
              <div className="mt-8 pt-6 border-t border-red-100 dark:border-red-900/30">
                <h3 className="text-red-600 font-medium mb-2">Danger Zone</h3>
                <button
                  onClick={handleDeleteGroup}
                  disabled={hasUnsettledDebts || deletingGroup}
                  className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {deletingGroup ? "Deleting..." : "Delete Group"}
                </button>
                {hasUnsettledDebts && (
                  <p className="text-sm text-red-500 mt-2 text-center">
                    Cannot delete: All debts must be settled first.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'members' && (
                <div className="space-y-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs p-3 rounded-lg mb-4">
                         Only admins can remove members. Members with non-zero debt cannot be removed.
                    </div>

                    {members.map((member) => (
                        <div key={member.userId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-lg border border-gray-100 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center border border-gray-200 dark:border-zinc-700 text-gray-400">
                                    <UserIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                        {member.user.name || member.user.email}
                                        {member.userId === currentUserId && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 font-normal">(You)</span>}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${member.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300'}`}>
                                            {member.role}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Remove button: Not Self */}
                            {member.userId !== currentUserId && (
                                <button
                                    onClick={() => handleRemoveMember(member.userId)}
                                    disabled={removingMemberId === member.userId}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    title="Remove member"
                                >
                                    {removingMemberId === member.userId ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                                    ) : (
                                        <Trash2 className="w-5 h-5" />
                                    )}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
