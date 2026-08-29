import { redirect } from "next/navigation";

// Clerk defaults to /sign-in and /sign-up; our app uses /login and /signup.
// Any stray Clerk-default URL gets redirected so nothing 404s.
export default function ClerkSignInRedirect() {
  redirect("/login");
}
