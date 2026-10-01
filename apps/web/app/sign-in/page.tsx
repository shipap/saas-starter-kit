export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  if (process.env.PUBLIC_DEMO === "true") redirect("/");
  const { returnTo } = await searchParams;
  return (
    <AuthForm
      returnTo={returnTo?.startsWith("/invite?") ? returnTo : "/app/overview"}
    />
  );
}
