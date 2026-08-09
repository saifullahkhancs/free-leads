import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, ArrowRight, RefreshCw } from "lucide-react";
import { register, verifyEmail, resendVerification } from "../api/client";
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
