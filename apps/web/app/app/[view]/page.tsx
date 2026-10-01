import { Console } from "../../../components/console";
import { Attribution } from "../../../components/brand";
import { notFound } from "next/navigation";

export default async function AppPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (
    ![
      "overview",
      "projects",
      "team",
      "billing",
      "keys",
      "audit",
      "settings",
      "platform",
    ].includes(view)
  )
    notFound();
  return <Console view={view} footer={<Attribution compact />} />;
}
