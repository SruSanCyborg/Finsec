import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="card p-7">
      <h1 className="text-xl font-medium text-zinc-100">Sign in</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">Continuous security for money that moves.</p>
      <SignIn routing="path" path="/login" signUpUrl="/signup" />
    </div>
  );
}
