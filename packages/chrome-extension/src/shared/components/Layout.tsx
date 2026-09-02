import { useTranslation } from "react-i18next";
import { Outlet, NavLink } from "react-router-dom";
import {
  Coins,
  Send,
  QrCode,
  ArrowLeftRight,
  Lock,
  Home,
  History as HistoryIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { useWalletStore } from "../store/wallet";
import AccountSwitcher from "./AccountSwitcher";
import clsx from "clsx";

export default function Layout() {
  const { t } = useTranslation();
  const lock = useWalletStore((s) => s.lock);

  const NAV = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: Home },
    { to: "/tokens", label: t("nav.tokens"), icon: Coins },
    { to: "/send", label: t("nav.send"), icon: Send },
    { to: "/receive", label: t("nav.receive"), icon: QrCode },
    { to: "/swap", label: t("nav.swap"), icon: ArrowLeftRight },
    { to: "/history", label: t("nav.history"), icon: HistoryIcon },
    { to: "/settings", label: t("nav.settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-stellar-border bg-stellar-card flex flex-col">
        <div className="p-3 border-b border-stellar-border">
          <AccountSwitcher />
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-stellar-blue/20 text-white font-medium"
                    : "text-stellar-muted hover:text-white hover:bg-white/5"
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-stellar-border">
          <button
            onClick={lock}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stellar-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <Lock size={16} />
            {t("settings.lock", "Lock Wallet")}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
