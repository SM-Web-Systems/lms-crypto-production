import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNotificationStore } from "../store/notifications";
import { Bell, CheckCheck, Trash2, X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const typeIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const typeColors = {
  info: "text-blue-400",
  success: "text-stellar-success",
  warning: "text-yellow-400",
  error: "text-stellar-danger",
};

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    notifications,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
    unreadCount,
  } = useNotificationStore();

  const count = unreadCount();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("notifications.justNow", "Just now");
    if (mins < 60) return t("notifications.minsAgo", "{{count}}m ago", { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("notifications.hoursAgo", "{{count}}h ago", { count: hours });
    const days = Math.floor(hours / 24);
    return t("notifications.daysAgo", "{{count}}d ago", { count: days });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-stellar-muted hover:text-stellar-text hover:bg-stellar-card transition-colors"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-stellar-danger text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-96 bg-stellar-card border border-stellar-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-stellar-border">
            <h3 className="text-sm font-semibold text-stellar-text">
              {t("notifications.title", "Notifications")}
            </h3>
            <div className="flex gap-1">
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="p-1 text-stellar-muted hover:text-stellar-success transition-colors"
                  title={t("notifications.markAllRead", "Mark all read")}
                >
                  <CheckCheck size={16} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 text-stellar-muted hover:text-stellar-danger transition-colors"
                  title={t("notifications.clearAll", "Clear all")}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-stellar-muted hover:text-stellar-text transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-stellar-muted text-sm">
                {t("notifications.empty", "No notifications yet")}
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcons[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      if (n.link) {
                        navigate(n.link);
                        setOpen(false);
                      }
                    }}
                    className={`flex gap-3 p-3 border-b border-stellar-border/50 cursor-pointer hover:bg-stellar-dark/50 transition-colors ${
                      !n.read ? "bg-stellar-blue/5" : ""
                    }`}
                  >
                    <Icon size={18} className={`mt-0.5 flex-shrink-0 ${typeColors[n.type]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${!n.read ? "text-stellar-text" : "text-stellar-muted"}`}>
                          {n.title}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(n.id);
                          }}
                          className="text-stellar-muted hover:text-stellar-danger flex-shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <p className="text-xs text-stellar-muted mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-stellar-muted/60 mt-1">{formatTime(n.timestamp)}</p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 bg-stellar-blue rounded-full mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
