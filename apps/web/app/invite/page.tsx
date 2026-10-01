export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { InviteAcceptance } from "../../components/invite-acceptance";

export default async function Invitation({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; token?: string }>;
}) {
  if (process.env.PUBLIC_DEMO === "true") redirect("/");
  const params = await searchParams;
  return (
    <InviteAcceptance
      organizationId={params.organizationId || ""}
      token={params.token || ""}
    />
  );
}
