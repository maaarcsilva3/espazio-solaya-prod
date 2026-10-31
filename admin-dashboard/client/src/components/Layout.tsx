import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Dropdown } from 'flowbite-react';
import type { IconType } from 'react-icons';
import {
  HiCalendar,
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
  HiClipboardList,
  HiCog,
  HiColorSwatch,
  HiDotsHorizontal,
  HiHome,
  HiKey,
  HiLogout,
  HiMoon,
  HiPlus,
  HiSparkles,
  HiSun,
  HiUserAdd,
  HiUsers,
  HiChartBar,
  HiOfficeBuilding,
  HiViewBoards,
} from 'react-icons/hi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NewBookingProvider, useNewBooking } from '../context/NewBookingContext';
import { api } from '../lib/api';
import type { Stats } from '../lib/types';
import Sheet from './ui/Sheet';
import ChangePasswordModal from './ChangePasswordModal';

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  end?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: HiHome, end: true },
      { to: '/calendar', label: 'Calendar', icon: HiCalendar },
    ],
  },
  {
    label: 'Bookings',
    items: [{ to: '/requests', label: 'Requests', icon: HiClipboardList }],
  },
  {
    label: 'Pipeline',
    items: [
      { to: '/pipeline/events', label: 'Event venue', icon: HiViewBoards },
      { to: '/pipeline/rooms', label: 'Room bookings', icon: HiOfficeBuilding },
      { to: '/pipeline/analytics', label: 'Performance', icon: HiChartBar },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/offerings', label: 'Offerings', icon: HiSparkles },
      { to: '/statuses', label: 'Statuses', icon: HiColorSwatch },
      { to: '/agents', label: 'Agents', icon: HiUserAdd },
      { to: '/admins', label: 'Admins', icon: HiUsers },
      { to: '/settings', label: 'Settings', icon: HiCog },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })));
const MOBILE_TABS = ['/', '/requests', '/calendar'];
const MORE_ITEMS = ALL_ITEMS.filter((i) => !MOBILE_TABS.includes(i.to));

function currentItem(pathname: string) {
  return ALL_ITEMS.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to))) ?? ALL_ITEMS[0];
}

function initials(name?: string) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function Avatar({ name, className = '' }: { name?: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300 ${className}`}
    >
      {initials(name)}
    </span>
  );
}

function IconButton({ icon: Icon, label, onClick }: { icon: IconType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-[1.25rem] rounded-full bg-primary-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function Shell() {
  const { admin, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const openNewBooking = useNewBooking();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1');
  const [moreOpen, setMoreOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<Stats>('/stats'),
    refetchInterval: 60_000,
  });
  const pending = stats?.pending ?? 0;
  const page = currentItem(pathname);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const userMenu = (
    <Dropdown
      inline
      arrowIcon={false}
      placement="bottom-end"
      label={<Avatar name={admin?.name} className="h-9 w-9 text-sm" />}
    >
      <Dropdown.Header>
        <span className="block text-sm font-medium">{admin?.name}</span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{admin?.email}</span>
      </Dropdown.Header>
      <Dropdown.Item icon={HiKey} onClick={() => setPasswordOpen(true)}>
        Change password
      </Dropdown.Item>
      <Dropdown.Item icon={HiLogout} onClick={logout}>
        Log out
      </Dropdown.Item>
    </Dropdown>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-gray-200 bg-white transition-[width] duration-200 dark:border-gray-700 dark:bg-gray-800 lg:flex ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className={`flex h-16 items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <HiCalendar className="h-5 w-5" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">Booking Manager</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Admin dashboard</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-gray-200 dark:bg-gray-700" />
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition ${
                        collapsed ? 'justify-center px-0' : 'px-3'
                      } ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="flex-1">{item.label}</span>}
                    {item.to === '/requests' && (
                      <CountBadge count={pending} className={collapsed ? 'absolute right-1 top-1' : ''} />
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <button
            onClick={toggleCollapsed}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white ${
              collapsed ? 'justify-center' : 'px-3'
            }`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <HiChevronDoubleRight className="h-5 w-5" /> : <HiChevronDoubleLeft className="h-5 w-5" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/85 px-4 backdrop-blur dark:border-gray-700 dark:bg-gray-800/85 sm:px-6 lg:h-16 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white lg:hidden">
              <HiCalendar className="h-4 w-4" />
            </span>
            <p className="hidden text-sm text-gray-400 dark:text-gray-500 lg:block">{page.group}</p>
            <span className="hidden text-gray-300 dark:text-gray-600 lg:block">/</span>
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white">{page.label}</h1>
          </div>
          <button
            onClick={() => openNewBooking()}
            className="hidden h-10 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-800 sm:flex"
          >
            <HiPlus className="h-4 w-4" /> New booking
          </button>
          <IconButton icon={isDark ? HiSun : HiMoon} label={isDark ? 'Light mode' : 'Dark mode'} onClick={toggle} />
          {userMenu}
        </header>

        <main className="px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Phone: floating add button */}
      <button
        onClick={() => openNewBooking()}
        aria-label="New booking"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 active:scale-95 sm:hidden"
      >
        <HiPlus className="h-6 w-6" />
      </button>

      {/* Phone: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 lg:hidden">
        {MOBILE_TABS.map((to) => {
          const item = ALL_ITEMS.find((i) => i.to === to)!;
          return (
            <NavLink
              key={to}
              to={to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                }`
              }
            >
              <item.icon className="h-6 w-6" />
              {item.to === '/' ? 'Home' : item.label}
              {to === '/requests' && <CountBadge count={pending} className="absolute left-1/2 top-1.5 ml-1" />}
            </NavLink>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            MORE_ITEMS.some((i) => i.to === page.to) ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <HiDotsHorizontal className="h-6 w-6" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom">
        <div className="px-4 pb-4 pt-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
            <Avatar name={admin?.name} className="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{admin?.name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{admin?.email}</p>
            </div>
          </div>
          <div className="space-y-1">
            {MORE_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-base ${
                    isActive
                      ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setMoreOpen(false);
                setPasswordOpen(true);
              }}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-base text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <HiKey className="h-5 w-5" /> Change password
            </button>
            <button
              onClick={logout}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-base text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <HiLogout className="h-5 w-5" /> Log out
            </button>
          </div>
        </div>
      </Sheet>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

export default function Layout() {
  return (
    <NewBookingProvider>
      <Shell />
    </NewBookingProvider>
  );
}
