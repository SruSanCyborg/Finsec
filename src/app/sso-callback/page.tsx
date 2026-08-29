import { redirect } from "next/navigation";

// Clerk's OAuth/SSO callback lands here after Google/GitHub sign-in.
// Our SignIn lives at /login (routing="path"), which handles the callback
// state — just send the user there.
export default function SsoCallback() {
  redirect("/login");
}
