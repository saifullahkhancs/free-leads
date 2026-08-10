import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import AuthGuard from "./components/AuthGuard";
import RoleGuard from "./components/RoleGuard";
import DashboardLayout from "./components/DashboardLayout";
import AppShell from "./components/AppShell";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// App view (leads directory)
import DirectoryPage from "./pages/app/DirectoryPage";
import ProfilePage from "./pages/app/ProfilePage";

// Dashboard (admin workspace)
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import LeadsPage from "./pages/admin/LeadsPage";
import AddLeadPage from "./pages/admin/AddLeadPage";
import ImportLeadsPage from "./pages/admin/ImportLeadsPage";
import UsersPage from "./pages/admin/UsersPage";
import RolesPage from "./pages/admin/RolesPage";

import "./styles/auth.css";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* App view — the modern leads directory */}
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DirectoryPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Dashboard — CMS workspace with sidebar (requires authentication) */}
          <Route element={<AuthGuard />}>
            <Route path="/admin" element={<DashboardLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="add-lead" element={<AddLeadPage />} />
              <Route path="import" element={<ImportLeadsPage />} />

              <Route element={<RoleGuard roles={["admin", "super_admin"]} />}>
                <Route path="users" element={<UsersPage />} />
                <Route path="roles" element={<RolesPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
