import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export default function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState("");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const doLogin = async () => {
      try {
        const data = await api.loginWithGoogle(code, state);
        api.setAccessToken(data.access_token);
        setUser(data.user);
        navigate(data.user?.roles?.some((r) => ["admin", "super_admin"].includes(r)) ? "/admin" : "/app", {
          replace: true,
        });
      } catch (err) {
        setError(err.message || "Google sign-in failed");
      }
    };
    if (code && state) doLogin();
    else setError("Missing Google authorization code");
  }, [params, navigate, setUser]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        {error ? (
          <>
            <h2>Sign-in failed</h2>
            <p className="error-message">{error}</p>
            <button className="auth-submit-btn" onClick={() => navigate("/login")}>
              Back to login
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", color: "var(--app-ink-muted)", padding: "30px 0" }}>
            <Loader2 className="spin" size={24} />
            <p>Signing you in with Google…</p>
          </div>
        )}
      </div>
    </div>
  );
}
