import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/jwt";
import { redirect } from "next/navigation";
import Link from "next/link";
import CreateGroupButton from "./_components/CreateGroupButton";
import LogoutButton from "../components/LogoutButton";

async function getGroups() {
  const user = await getCurrentUser();
  if (!user) return null;

  return await prisma.group.findMany({
    where: {
      memberships: {
        some: {
          userId: user.userId,
        },
      },
    },
    include: {
      _count: {
        select: { memberships: true },
      },
      memberships: {
        where: {
          userId: user.userId,
        },
        select: {
          netBalance: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const groups = await getGroups();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex justify-between w-full sm:w-auto items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                My Groups
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Manage your shared expenses and settlements
              </p>
            </div>
            <div className="sm:hidden">
              <LogoutButton />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LogoutButton />
            </div>
            <CreateGroupButton />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups?.map((group) => {
            const myBalance = Number(group.memberships[0]?.netBalance || 0);
            const isPositive = myBalance > 0;
            const isNegative = myBalance < 0;

            return (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="group block p-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {group.name}
                  </h3>
                  <span className="text-xs font-medium px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full">
                    {group._count.memberships} members
                  </span>
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Your Balance
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isNegative
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: group.currency,
                    }).format(myBalance)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isPositive
                      ? "You are owed"
                      : isNegative
                      ? "You owe"
                      : "Settled up"}
                  </p>
                </div>
              </Link>
            );
          })}

          {groups?.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <p className="text-gray-500 dark:text-gray-400">
                You haven&apos;t joined any groups yet.
              </p>
              <p className="text-sm text-gray-400">
                Create a new one or ask a friend to invite you!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
