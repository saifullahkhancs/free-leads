import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, RefreshCw } from "lucide-react";
import { register, verifyEmail, resendVerification, getGoogleAuthUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const [step, setStep] = useState("register"); // "register" or "verify"
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await register(
        formData.firstName,
        formData.lastName,
        formData.email,
        formData.password
      );
      setMessage(data.message);
      setStep("verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await verifyEmail(formData.email, verificationCode);

      // Auto-login after successful verification.
      await login(formData.email, formData.password);

      setMessage("Verification successful! Redirecting...");
      setTimeout(() => navigate("/app", { replace: true }), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);

    try {
      const data = await resendVerification(formData.email);
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>{step === "register" ? "Create Account" : "Verify Email"}</h1>
          <p>{step === "register" ? "Sign up to get started" : "Enter the code sent to your email"}</p>
        </div>

        {step === "register" ? (
          <>
            <button
              type="button"
              className="auth-google-btn"
              onClick={async () => {
                try {
                  const res = await getGoogleAuthUrl();
                  window.location.href = res.url;
                } catch (err) {
                  setError(err.message || "Google sign-in is not configured.");
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
              </svg>
              Continue with Google
            </button>
            <div className="auth-divider"><span>or sign up with email</span></div>
            <form onSubmit={handleRegister} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <div className="input-wrapper">
                <User size={20} className="input-icon" />
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <div className="input-wrapper">
                <User size={20} className="input-icon" />
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <Mail size={20} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
              {!loading && <ArrowRight size={20} className="btn-icon" />}
            </button>
            </form>
            </>
        ) : (
          <form onSubmit={handleVerify} className="auth-form">
            {message && <div className="success-message">{message}</div>}
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="verificationCode">Verification Code</label>
              <div className="input-wrapper">
                <input
                  id="verificationCode"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="12345"
                  required
                  maxLength={10}
                  className="verification-input"
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Verifying..." : "Verify Email"}
              {!loading && <ArrowRight size={20} className="btn-icon" />}
            </button>

            <button
              type="button"
              onClick={handleResend}
              className="resend-btn"
              disabled={resending}
            >
              <RefreshCw size={16} className={resending ? "spinning" : ""} />
              {resending ? "Resending..." : "Resend Code"}
            </button>
          </form>
        )}

        <div className="auth-footer">
          {step === "register" ? (
            <p>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          ) : (
            <p>
              <Link to="/login">Back to login</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
