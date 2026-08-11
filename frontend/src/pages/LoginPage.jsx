import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, ArrowRight, MailCheck, Send } from "lucide-react";
import { verifyEmail, resendVerification, getGoogleAuthUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [view, setView] = useState("login"); // 'login' or 'verify'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectAfterLogin = () => {
    const from = location.state?.from?.pathname;
    if (from) {
      navigate(from, { replace: true });
      return;
    }
    navigate(hasRole("admin", "super_admin") ? "/admin" : "/app", { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await login(email, password);
      redirectAfterLogin();
    } catch (err) {
      // Same behavior as the original app: an unverified account gets
      // bounced into the verification step instead of a bare error.
      if (
        err.message.includes("User not verified") ||
        err.message.includes("new verification code has been sent")
      ) {
        setView("verify");
        setMessage("A new verification code has been sent. Please check your email.");
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await verifyEmail(email, code);
      setMessage("Account verified successfully! Please log in.");
      setView("login");
      setCode("");
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await resendVerification(email);
      setMessage("A new verification code has been sent to your email.");
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getGoogleAuthUrl();
      window.location.href = res.url;
    } catch (err) {
      setError(err.message || "Google sign-in is not configured.");
      setLoading(false);
    }
  };

  if (view === "verify") {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <MailCheck className="auth-icon" />
          <h2>Check your email</h2>
          <p className="muted">
            We've sent a verification code to <strong>{email}</strong>.
          </p>
          <form onSubmit={handleVerifySubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}
            <label htmlFor="code">Verification Code</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
              required
              maxLength="10"
              className="auth-input"
            />
            <button type="submit" disabled={loading} className="auth-submit-btn">
              {loading ? "Verifying..." : "Verify Account"}
            </button>
          </form>
          <div className="auth-footer">
            <p>Didn't receive the code?</p>
            <button onClick={handleResend} disabled={loading} className="link-button">
              <Send size={14} /> {loading ? "Sending..." : "Resend Code"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Sign in to your account</p>
        </div>

        <button
          type="button"
          className="auth-google-btn"
          onClick={handleGoogle}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider"><span>or sign in with email</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail size={20} className="input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock size={20} className="input-icon" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
            {!loading && <ArrowRight size={20} className="btn-icon" />}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account? <Link to="/signup">Sign up</Link>
          </p>
          <p>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
