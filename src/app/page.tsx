import { redirect } from "next/navigation";

/** No landing page: the app opens on the login screen (role tabs + demo quick login). */
export default function Home() {
  redirect("/login");
}
