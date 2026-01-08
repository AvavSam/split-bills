import { getSessionCookie, verifyJWT } from "@/lib/jwt";
import { redirect } from "next/navigation";
import AuthForm from "./components/AuthForm";

export default async function Home() {
  const token = await getSessionCookie();

  if (token) {
    const payload = await verifyJWT(token);
    if (payload) {
      redirect("/groups");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black flex flex-col justify-center items-center p-4">
      <AuthForm />

      <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">Simple bill splitting for groups of friends.</p>
    </div>
  );
}
