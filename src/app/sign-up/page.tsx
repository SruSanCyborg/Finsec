import { redirect } from "next/navigation";

// Clerk defaults to /sign-up; our app uses /signup. Redirect so nothing 404s.
export default function ClerkSignUpRedirect() {
  redirect("/signup");
}
