/**
 * Root route. Per PRODUCT.md's "one user, zero training" principle,
 * there is no separate landing/dashboard screen to detour through —
 * this sends the one person who ever visits sift straight to the
 * screen they actually came here for.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/review");
}
