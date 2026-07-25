import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import EmailVerificationBanner from "./EmailVerificationBanner";
import {
  Coins,
  Send,
  QrCode,
  ArrowLeftRight,
  LogOut,
  Home,
  History as HistoryIcon,
  HelpCircle,
  Settings as SettingsIcon,
  Key,
  Menu,
  X,
  Image as ImageIcon,
} from "lucide-react";

import { useAuthStore } from "../store/auth";
import { useWalletStore } from "../store/wallet";
import AccountSwitcher from "./AccountSwitcher";
import clsx from "clsx";
import { Droplets, BookUser, DollarSign, PieChart } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

export default function Layout() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const walletLogout = useWalletStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    walletLogout();
    navigate("/login");
  };

  const NAV_SECTIONS = [
    {
      label: t("nav.group.main", ""),
      items: [
        { to: "/dashboard", label: t("nav.dashboard"), icon: Home },
        { to: "/tokens", label: t("nav.tokens"), icon: Coins },
        { to: "/nfts", label: t("nav.nfts", "NFTs"), icon: ImageIcon },
      ],
    },
    {
      label: t("nav.group.transact", "Transact"),
      items: [
        { to: "/send", label: t("nav.send"), icon: Send },
        { to: "/receive", label: t("nav.receive"), icon: QrCode },
        { to: "/swap", label: t("nav.swap"), icon: ArrowLeftRight },
      ],
    },
    {
      label: t("nav.group.finance", "Finance"),
      items: [
        { to: "/buy-sell", label: t("nav.buySell", "Buy & Sell"), icon: DollarSign },
        { to: "/earn", label: t("nav.earn", "Earn"), icon: Droplets },
        { to: "/portfolio", label: t("nav.portfolio", "Portfolio"), icon: PieChart },
      ],
    },
    {
      label: t("nav.group.social", "Social"),
      items: [
        { to: "/contacts", label: t("nav.contacts", "Contacts"), icon: BookUser },
        { to: "/history", label: t("nav.history"), icon: HistoryIcon },
      ],
    },
    {
      label: t("nav.group.system", "System"),
      items: [
        { to: "/settings", label: t("nav.settings"), icon: SettingsIcon },
        { to: "/api-keys", label: t("nav.apiKeys", "API Keys"), icon: Key },
        { to: "/help", label: t("nav.help", "Help & FAQ"), icon: HelpCircle },
      ],
    },
  ];

  // Flat list for mobile header title lookup
  const NAV = NAV_SECTIONS.flatMap((s) => s.items);

  const sidebarContent = (
    <>
      <div className="p-3 border-b border-stellar-border">
        <AccountSwitcher />
      </div>

      {user && (
        <div className="px-4 py-3 border-b border-stellar-border">
          <p className="text-sm text-stellar-text font-medium truncate">
            {user.firstName ? (user.firstName + " " + (user.lastName || "")).trim() : user.email}
          </p>
          <p className="text-xs text-stellar-muted truncate">{user.email}</p>
        </div>
      )}

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : ""}>
            {section.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-stellar-muted/60">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-stellar-blue/15 text-white font-medium"
                        : "text-stellar-muted hover:text-stellar-text hover:bg-white/5"
                    )
                  }
                >
                  <Icon size={17} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-stellar-border space-y-2">
        <div className="flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
        </div>
        <a
          href="https://lms.smwebsystems.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stellar-muted hover:text-stellar-text rounded-lg hover:bg-white/5 transition-colors"
        >
          <ArrowLeftRight size={16} />
          Return to LMS
        </a>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={16} />
          {t("settings.logout", "Sign Out")}
        </button>
      </div>
    </>
  );

  // Get current page title for mobile header
  const currentNav = NAV.find((n) => location.pathname.startsWith(n.to));
  const pageTitle = currentNav?.label || "Amma Wallet";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-stellar-border bg-stellar-card flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-72 bg-stellar-card border-r border-stellar-border flex flex-col transform transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-3 border-b border-stellar-border">
          <span className="text-stellar-text font-semibold text-sm">Amma Wallet</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded-lg text-stellar-muted hover:text-stellar-text hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-stellar-border bg-stellar-card">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-stellar-muted hover:text-stellar-text hover:bg-white/10 transition-colors"
          >
            <Menu size={22} />
          </button>
          <h1 className="text-stellar-text font-medium text-sm truncate flex-1">{pageTitle}</h1>
          <NotificationBell />
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8">
            <EmailVerificationBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
