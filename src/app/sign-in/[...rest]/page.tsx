import { redirect } from "next/navigation";

// Clerk's default multi-step sign-in paths (/sign-in/factor-two, etc.) land
// here. Our SignIn is path-routed at /login which handles all steps, so send
// any Clerk-default sign-in sub-path to /login.
export default function SignInCatchAll() {
  redirect("/login");
}
