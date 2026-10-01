export const dynamic = "force-dynamic";

import { Landing } from "../components/landing";
import { Attribution } from "../components/brand";

export default function Home() {
  return (
    <Landing
      publicDemo={process.env.PUBLIC_DEMO === "true"}
      footer={<Attribution />}
    />
  );
}
