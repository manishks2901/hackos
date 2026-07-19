"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setTokens } from "../../../lib/api";

export default function AuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = params.get("access");
    const refresh = params.get("refresh");
    if (!access || !refresh) {
      setFailed(true);
      return;
    }
    setTokens({ accessToken: access, refreshToken: refresh });
    // Strip the tokens from the URL before navigating anywhere.
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/dashboard");
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        {failed ? (
          <>
            <h1 style={{ fontSize: 20, letterSpacing: "-0.02em", marginBottom: 12 }}>
              Sign-in didn&apos;t complete
            </h1>
            <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>
              We didn&apos;t receive any credentials from the provider. Please try again.
            </p>
            <Link className="btn" href="/signin">
              Back to sign in
            </Link>
          </>
        ) : (
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Signing you in…</p>
        )}
      </div>
    </main>
  );
}
