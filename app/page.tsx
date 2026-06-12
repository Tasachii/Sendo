import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/tenant";

export default async function Home() {
  const ctx = await getSessionContext();
  redirect(ctx ? "/dashboard" : "/login");
}
