import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useWalletStore } from "./store/wallet";
import Layout from "./components/Layout";
import NftsPage from "./pages/Nfts";
const LoginPage    = lazy(() => import("./pages/Login"));
const SsoLoginPage = lazy(() => import("./pages/SsoLogin"));
const RegisterPage = lazy(() => import("./pages/Register"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmail"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword"));
const OnboardingPage = lazy(() => import("./pages/Onboarding"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const TokensPage = lazy(() => import("./pages/Tokens"));
const TokenDetailPage = lazy(() => import("./pages/TokenDetail"));
const SendPage = lazy(() => import("./pages/Send"));
const ReceivePage = lazy(() => import("./pages/Receive"));
const SwapPage = lazy(() => import("./pages/Swap"));
const HistoryPage = lazy(() => import("./pages/History"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeys"));
const HelpPage = lazy(() => import("./pages/Help"));
const ContactsPage = lazy(() => import("./pages/Contacts"));
const PortfolioPage = lazy(() => import("./pages/Portfolio"));
const EarnPage = lazy(() => import("./pages/Earn"));
const BuySellPage = lazy(() => import("./pages/BuySell"));
// AW-008/009 — Internal admin console (sessionStorage auth, completely separate from user flow)
const AdminLoginPage = lazy(() => import("./pages/AdminLogin"));
const AdminConsolePage = lazy(() => import("./pages/AdminConsole"));
const AdminTenantDetailPage = lazy(() => import("./pages/AdminTenantDetail"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeAccountId = useWalletStore((s) => s.activeAccountId);
  const accounts = useWalletStore((s) => s.accounts);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!activeAccountId || accounts.length === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div></div>}>
          <Routes>
      {/* SSO entry point — must be outside AuthRoute so already-authenticated users pass through */}
      <Route path="/sso/login" element={<SsoLoginPage />} />

      {/* Public auth routes */}
      <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<AuthRoute><ResetPasswordPage /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />

      {/* Onboarding — requires auth but no wallet yet */}
      <Route
        path="/onboarding"
        element={
          isAuthenticated ? <OnboardingPage /> : <Navigate to="/login" replace />
        }
      />
      <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />

      {/* Protected app routes */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/tokens/:code/:issuer" element={<TokenDetailPage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/receive" element={<ReceivePage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/buy-sell" element={<BuySellPage />} />
          <Route path="/help" element={<HelpPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/nfts" element={<NftsPage />} />
      </Route>

      {/* Internal admin console — sessionStorage JWT auth, no user auth required */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/tenants/:id" element={<AdminTenantDetailPage />} />
      <Route path="/admin" element={<AdminConsolePage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
          </Suspense>
  );
}
