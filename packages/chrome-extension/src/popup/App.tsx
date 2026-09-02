import { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  Coins,
  Send,
  QrCode,
  ArrowLeftRight,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Droplets,
  DollarSign,
  PieChart,
  Image as ImageIcon,
  Users,
} from "lucide-react";
import { useAuthStore } from "../shared/store/auth";
import { useWalletStore } from "../shared/store/wallet";
import AccountSwitcher from "../shared/components/AccountSwitcher";
import clsx from "clsx";

import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Tokens from "./pages/Tokens";
import SendPage from "./pages/Send";
import ReceivePage from "./pages/Receive";
import SwapPage from "./pages/Swap";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import TokenDetailPage from "./pages/TokenDetail";
import ContactsPage from "./pages/Contacts";
import EarnPage from "./pages/Earn";
import BuySellPage from "./pages/BuySell";
import PortfolioPage from "./pages/Portfolio";
import ForgotPasswordPage from "./pages/ForgotPassword";
import NftsPage from "./pages/Nfts";
import ApprovePage from "./pages/Approve";


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAccount = useWalletStore(
    (s) => s.accounts.length > 0 && s.activeAccountId !== null
  );

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasAccount) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function BottomNav() {
  const { t } = useTranslation();

  const tabs = [
    { to: "/dashboard", icon: Home, label: t("nav.dashboard", "Home") },
    { to: "/tokens", icon: Coins, label: t("nav.tokens", "Tokens") },
    { to: "/nfts", icon: ImageIcon, label: t("nav.nfts", "NFTs") },
    { to: "/swap", icon: ArrowLeftRight, label: t("nav.swap", "Swap") },
    { to: "/buy-sell", icon: DollarSign, label: t("nav.buysell", "Buy") },
  ];

  return (
    <nav className="flex items-center justify-around border-t border-stellar-border bg-stellar-card px-1 py-1.5">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] transition-colors",
              isActive
                ? "text-stellar-blue"
                : "text-stellar-muted hover:text-white"
            )
          }
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="border-b border-stellar-border bg-stellar-card">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex-1 min-w-0">
          <AccountSwitcher />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => navigate("/send")} className="p-1.5 rounded-lg hover:bg-white/5 text-stellar-muted hover:text-white transition-colors" title={t("nav.send", "Send")}>
            <Send size={15} />
          </button>
          <button onClick={() => navigate("/receive")} className="p-1.5 rounded-lg hover:bg-white/5 text-stellar-muted hover:text-white transition-colors" title={t("nav.receive", "Receive")}>
            <QrCode size={15} />
          </button>
          <div className="w-px h-4 bg-stellar-border mx-0.5" />
          <button onClick={() => navigate("/history")} className="p-1.5 rounded-lg hover:bg-white/5 text-stellar-muted hover:text-white transition-colors" title={t("nav.history", "History")}>
            <HistoryIcon size={15} />
          </button>
          <button onClick={() => navigate("/settings")} className="p-1.5 rounded-lg hover:bg-white/5 text-stellar-muted hover:text-white transition-colors" title={t("nav.settings", "Settings")}>
            <SettingsIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg">
      <Routes>
        <Route
          path="/login"
          element={
            <AuthRoute>
              <LoginPage />
            </AuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <AuthRoute>
              <RegisterPage />
            </AuthRoute>
          }
        />
        <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
        <Route
          path="/onboarding"
          element={
            isAuthenticated ? (
              <Onboarding />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/"
          element={
            <Navigate
              to={isAuthenticated ? "/dashboard" : "/login"}
              replace
            />
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Header />
              <div className="flex-1 overflow-y-auto">
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/tokens" element={<Tokens />} />
                  <Route path="/nfts" element={<NftsPage />} />
                  <Route path="/send" element={<SendPage />} />
                  <Route path="/receive" element={<ReceivePage />} />
                  <Route path="/swap" element={<SwapPage />} />
                  <Route path="/earn" element={<EarnPage />} />
                  <Route path="/buy-sell" element={<BuySellPage />} />
                  <Route path="/portfolio" element={<PortfolioPage />} />
                  <Route path="/contacts" element={<ContactsPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route
                    path="/tokens/:code/:issuer"
                    element={<TokenDetailPage />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/dashboard" replace />}
                  />
                </Routes>
              </div>
              <BottomNav />
            </ProtectedRoute>
          }
        />
        <Route path="/approve" element={<ApprovePage />} />
      </Routes>
    </div>
  );
}
