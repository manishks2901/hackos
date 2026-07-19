import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "../../components/AuthForm";
import { OAuthButtons } from "../../components/OAuthButtons";

export default function SignUp() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Create your HackOS account
        </h1>
        <Suspense fallback={null}>
          <OAuthButtons />
        </Suspense>
        <AuthForm mode="signup" />
        <p className="hint">
          Already have an account? <Link href="/signin">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
