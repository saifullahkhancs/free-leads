import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, LogIn, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/**
 * Popup card shown when the login session expires mid-use (the refresh token
 * can no longer be renewed). The user logs back in *inside the modal*, so the
 * page underneath — form state, scroll position, running work — is untouched
 * and they continue exactly where they were.
 */
export default function SessionExpiredModal() {
  const { user, sessionExpired, reauthenticate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef(null);

  // Pre-fill the email of the user whose session just expired.
  useEffect(() => {
    if (sessionExpired) {
      setEmail(user?.email || "");
      setPassword("");
      setError(null);
      // Focus the password box — the email is already filled in.
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }, [sessionExpired, user?.email]);

  if (!sessionExpired) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reauthenticate(email, password);
      // Success: the modal unmounts (sessionExpired flips false) and the user
      // is still on the exact page they were working on.
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  const goToLoginPage = () => {
    // Full login page fallback (e.g. Google sign-in users). LoginPage sends
    // the user back to `state.from` after a successful login.
    navigate("/login", { state: { from: location }, replace: false });
  };

  return (
    <div className="session-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
      <div className="session-modal-card">
        <div className="session-modal-icon">
          <ShieldAlert size={26} />
        </div>
        <h2 id="session-expired-title">Your session has expired</h2>
        <p className="session-modal-sub">
          For your security you were signed out after a period of inactivity.
          Log in again to continue right where you left off — nothing on this
          page has been lost.
        </p>

        {error && <div className="session-modal-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit} className="session-modal-form">
          <label className="session-modal-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="session-modal-field">
            <span>Password</span>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
          </label>
          <button type="submit" className="session-modal-submit" disabled={submitting}>
            {submitting ? "Signing in…" : (<><LogIn size={16} /> Log in & continue</>)}
          </button>
        </form>

        <button type="button" className="session-modal-alt" onClick={goToLoginPage}>
          <Lock size={13} /> Use the full login page instead (Google sign-in, forgot password…)
        </button>
      </div>
    </div>
  );
}
