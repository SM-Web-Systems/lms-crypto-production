import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { messageService } from '../services/messageService';
import {
  LogOut,
  Users,
  FileText,
  LayoutDashboard,
  BookOpen,
  MessageCircle,
  ClipboardList,
  Mail,
  User,
  UserCircle,
  Menu,
  X,
  Award,
  BarChart2,
  Tag,
  CreditCard,
} from 'lucide-react';
import WalletLinkingBanner from './WalletLinkingBanner';
import NotificationBell from './NotificationBell';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [walletBannerDismissed, setWalletBannerDismissed] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    const count = await messageService.getUnreadCount();
    setUnreadMessages(count);
  }, [user]);

  // Poll unread count: on mount, when path changes, and every 30 s
  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, 30_000);
    return () => clearInterval(id);
  }, [refreshUnread, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /** Dashboard paths are prefixes of every other app route — only exact match for those. */
  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    if (path === '/student' || path === '/admin' || path === '/lecturer') return false;
    return location.pathname.startsWith(path + '/');
  };

  const navigation =
    user?.role === 'admin'
      ? [
          { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
          { name: 'Students', path: '/admin/students', icon: Users },
          { name: 'Submissions', path: '/admin/submissions', icon: FileText },
          { name: 'Course', path: '/admin/course', icon: BookOpen },
          { name: 'Quizzes', path: '/admin/quizzes', icon: ClipboardList },
          { name: 'Resources', path: '/admin/documents', icon: BookOpen },
          { name: 'Certificates', path: '/admin/certificates', icon: Award },
          { name: 'Sponsor Portal', path: '/admin/sponsor', icon: Tag },
          { name: 'Forum', path: '/admin/forum', icon: MessageCircle },
          { name: 'Messages', path: '/admin/messages', icon: Mail },
          { name: 'Course members', path: '/admin/course-members', icon: UserCircle },
          { name: 'Profile', path: '/admin/profile', icon: User },
        ]
      : user?.role === 'lecturer'
      ? [
          { name: 'Dashboard', path: '/lecturer', icon: LayoutDashboard },
          { name: 'Submissions', path: '/lecturer/submissions', icon: FileText },
          { name: 'Messages', path: '/lecturer/messages', icon: Mail },
          { name: 'Profile', path: '/lecturer/profile', icon: User },
        ]
      : [
          { name: 'Dashboard', path: '/student', icon: LayoutDashboard },
          { name: 'My Progress', path: '/student/progress', icon: BarChart2 },
          { name: 'My Submissions', path: '/student/submissions', icon: FileText },
          { name: 'Payments', path: '/student/payments', icon: CreditCard },
          { name: 'Course', path: '/student/course', icon: BookOpen },
          { name: 'Quizzes', path: '/student/quizzes', icon: ClipboardList },
          { name: 'Resources', path: '/student/documents', icon: BookOpen },
          { name: 'Forum', path: '/student/forum', icon: MessageCircle },
          { name: 'Messages', path: '/student/messages', icon: Mail },
          { name: 'Course members', path: '/student/course-members', icon: UserCircle },
          { name: 'Profile', path: '/student/profile', icon: User },
        ];

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-neutral-900/40 z-40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* App navigation rail */}
      <aside
        className={[
          'fixed lg:sticky top-0 z-50 h-screen w-56 xl:w-60 shrink-0 flex flex-col bg-gradient-to-b from-white to-neutral-50/95 border-r border-neutral-200/90 shadow-sm lg:shadow-none',
          'transition-transform duration-200 ease-out lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="p-4 border-b border-neutral-200/80 flex items-center gap-3 min-h-[4rem]">
          <img src="/logo.png" alt="SM Web Systems" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-primary-dark leading-tight truncate">SM Web Systems</p>
            <p className="text-[11px] text-neutral-500 truncate">Learning Management</p>
          </div>
          <button
            type="button"
            className="lg:hidden ml-auto p-2 rounded-md text-neutral-600 hover:bg-neutral-100"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const isMessages = item.name === 'Messages';
            const badge = isMessages && unreadMessages > 0 ? unreadMessages : 0;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={[
                  'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-white text-primary-dark shadow-card ring-1 ring-neutral-900/5 shadow-[inset_3px_0_0_0_#3d7a8c]'
                    : 'text-neutral-600 hover:bg-white/80 hover:text-neutral-900',
                ].join(' ')}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-accent-teal' : 'text-neutral-400'}`} />
                <span className="truncate flex-1">{item.name}</span>
                {badge > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className="h-14 shrink-0 bg-white/90 backdrop-blur-md border-b border-neutral-200/90 flex items-center justify-between gap-3 px-4 lg:px-6">
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-neutral-700 hover:bg-neutral-100"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-3 sm:gap-4">
            {user?.role === 'student' && <NotificationBell />}
            <div className="text-right hidden sm:block min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate max-w-[140px] sm:max-w-[200px]">
                {user?.name}
              </p>
              <p className="text-xs text-neutral-500 capitalize">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white bg-accent-teal hover:bg-accent-teal-hover transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-teal shrink-0"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {user?.role === 'student' &&
            user?.walletLinkingStatus === 'existing_account' &&
            !walletBannerDismissed && (
              <WalletLinkingBanner onDismiss={() => setWalletBannerDismissed(true)} />
            )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
