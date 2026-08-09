import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Nest inside <AuthGuard> for routes that also require a specific role,
 * e.g. the admin dashboard (Section 4, Module 5 of the dev doc).
 *
 * <Route element={<AuthGuard />}>
 *   <Route element={<RoleGuard roles={["admin", "super_admin"]} />}>
 *     <Route path="/admin" element={<AdminDashboard />} />
 *   </Route>
 * </Route>
 */
export default function RoleGuard({ roles = [], children }) {
  const { hasRole } = useAuth();

  if (!hasRole(...roles)) {
    return <Navigate to="/" replace />;
  }

  return children || <Outlet />;
}
