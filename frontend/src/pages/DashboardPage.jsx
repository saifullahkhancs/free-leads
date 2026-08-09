import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-container">
      <h1>Welcome, {user?.firstName}</h1>
      <p>Email: {user?.email}</p>
      <p>Roles: {user?.roles?.join(", ") || "none"}</p>
      <button onClick={logout} className="auth-submit-btn" style={{ maxWidth: 200 }}>
        Log out
      </button>
    </div>
  );
}
