import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationService, Notification } from '../services/notificationService';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silently fail — polling will retry in 60s
    }
  }, []);

  // Fetch on mount + 60s polling
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleBellClick = () => {
    if (!open) fetchNotifications(); // re-fetch for freshness
    setOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notif: Notification) => {
    try {
      if (!notif.read) {
        await notificationService.markRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // best-effort
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleBellClick}
        className="relative inline-flex items-center justify-center p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-neutral-900/10 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-sm font-semibold text-neutral-800">Notifications</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotificationClick(notif)}
                  className={[
                    'w-full text-left px-4 py-3 border-b border-neutral-50 hover:bg-neutral-50 transition-colors',
                    !notif.read ? 'bg-blue-50/50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!notif.read ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-600'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    </div>
                    <span className="text-[11px] text-neutral-400 whitespace-nowrap shrink-0 mt-0.5">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  {!notif.read && (
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mt-1" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
