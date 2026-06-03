import { useLocation, Link } from "wouter";
import { useAuth } from "../../hooks/useAuth.js";
import { trpc } from "../../lib/trpc.js";
import { cn } from "../../lib/utils.js";

const NAV_COMMON = [
  { path: "/", label: "选题看板", sub: "KANBAN" },
  { path: "/calendar", label: "发布日历", sub: "CALENDAR" },
];

const NAV_TEACHER = [
  { path: "/data-entry", label: "数据录入", sub: "DATA ENTRY" },
];

const NAV_LEADER = [
  { path: "/data-overview", label: "数据情况", sub: "DATA" },
];

const NAV_TAIL_LEADER = [
  { path: "/reviews", label: "复盘报告", sub: "REVIEW" },
  { path: "/recommendations", label: "下期调整", sub: "RECOMMEND" },
  { path: "/dashboard", label: "矩阵总览", sub: "OVERVIEW" },
];

const NAV_TAIL_TEACHER = [
  { path: "/reviews", label: "复盘报告", sub: "REVIEW" },
  { path: "/recommendations", label: "下期调整", sub: "RECOMMEND" },
];

const ADMIN_ITEMS = [
  { path: "/admin/accounts", label: "账号管理", sub: "ACCOUNTS" },
  { path: "/admin/users", label: "用户管理", sub: "USERS" },
  { path: "/admin/types", label: "类型管理", sub: "TYPES" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [location, navigate] = useLocation();
  const { user, logout, isLeader, isTeacher, selectedAccountId, setSelectedAccountId } = useAuth();

  // Query selected account name for teachers
  const accountsQuery = trpc.account.listByOwner.useQuery(undefined, {
    enabled: isTeacher,
    refetchOnWindowFocus: false,
  });
  const selectedAccount = accountsQuery.data?.find((a) => a.id === selectedAccountId);
  const hasMultipleAccounts = (accountsQuery.data?.length || 0) > 1;

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const navTail = isTeacher ? NAV_TAIL_TEACHER : NAV_TAIL_LEADER;

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-6 pt-8 pb-6">
        <h1 className="font-serif text-[22px] font-bold text-white tracking-tight leading-tight">
          矩阵罗盘
        </h1>
        <p className="font-mono mt-1.5 text-[#475569] text-[11px] tracking-[0.18em] uppercase">
          MATRIX COMPASS
        </p>
      </div>

      {/* Selected account indicator for teachers */}
      {isTeacher && selectedAccount && (
        <div className="mx-4 mb-2">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded bg-[#1E293B]",
              hasMultipleAccounts && "cursor-pointer hover:bg-[#334155] transition-colors"
            )}
            onClick={hasMultipleAccounts ? () => { setSelectedAccountId(null); navigate("/"); } : undefined}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedAccount.mainColor || "#CBD5E1" }}
            />
            <span className="text-[13px] text-[#CBD5E1] font-medium truncate flex-1">
              {selectedAccount.accountName}
            </span>
            {hasMultipleAccounts && (
              <svg className="w-3 h-3 text-[#64748B] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="mx-6 border-t border-[#1E293B]" />

      {/* Nav */}
      <nav className="px-4 py-6 space-y-2">
        {[...NAV_COMMON, ...(isLeader ? NAV_LEADER : NAV_TEACHER), ...navTail].map((item) => (
          <Link
            key={item.path}
            href={item.path}
            onClick={onClose}
            className={cn(
              "flex items-center justify-between px-4 py-3 rounded text-[15px] transition-colors",
              isActive(item.path)
                ? "bg-[#1E3A5F] text-white font-medium"
                : "hover:bg-[#1E293B] hover:text-[#CBD5E1]"
            )}
          >
            <span>{item.label}</span>
            <span
              className="font-mono text-[11px] tracking-widest opacity-40"
              style={{ letterSpacing: "0.12em" }}
            >
              {item.sub}
            </span>
          </Link>
        ))}

        {isLeader && (
          <>
            <div className="pt-6 pb-2 px-4">
              <p
                className="text-[11px] font-mono tracking-widest text-[#475569]"
                style={{ letterSpacing: "0.18em" }}
              >
                ADMIN
              </p>
            </div>
            {ADMIN_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded text-[15px] transition-colors",
                  isActive(item.path)
                    ? "bg-[#1E3A5F] text-white font-medium"
                    : "hover:bg-[#1E293B] hover:text-[#CBD5E1]"
                )}
              >
                <span>{item.label}</span>
                <span
                  className="font-mono text-[11px] tracking-widest opacity-40"
                  style={{ letterSpacing: "0.12em" }}
                >
                  {item.sub}
                </span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-[#1E293B] mt-auto">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-white shrink-0">
            {user?.name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#CBD5E1] truncate">
              {user?.name}
            </p>
            <p className="text-[12px] text-[#475569] truncate font-mono">
              {user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full mt-1 px-4 py-2 text-[14px] text-[#64748B] hover:text-[#F87171] rounded transition-colors text-left"
        >
          退出登录
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-ink/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile sidebar — fixed overlay */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-64 flex flex-col transition-transform lg:hidden",
          "bg-[#0F172A] text-[#94A3B8]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar — sticky, stays visible while scrolling */}
      <aside
        className="hidden lg:flex flex-col w-[280px] shrink-0 bg-[#0F172A] text-[#94A3B8] sticky top-0 h-screen overflow-y-auto"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
