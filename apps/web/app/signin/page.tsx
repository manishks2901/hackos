import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "../../components/AuthForm";
import { OAuthButtons } from "../../components/OAuthButtons";

export default function SignIn() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Sign in to HackOS
        </h1>
        <Suspense fallback={null}>
          <OAuthButtons />
        </Suspense>
        <AuthForm mode="signin" />
        <p className="hint">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}
