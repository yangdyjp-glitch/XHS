import { useLocation, Link } from "wouter";
import { useAuth } from "../../hooks/useAuth.js";
import { cn } from "../../lib/utils.js";

const NAV_ITEMS = [
  { path: "/", label: "选题看板", sub: "KANBAN" },
  { path: "/data-entry", label: "数据录入", sub: "DATA ENTRY" },
  { path: "/reviews", label: "复盘报告", sub: "REVIEW" },
  { path: "/recommendations", label: "下期调整", sub: "RECOMMEND" },
  { path: "/dashboard", label: "矩阵总览", sub: "OVERVIEW" },
];

const ADMIN_ITEMS = [
  { path: "/admin/accounts", label: "账号管理", sub: "ACCOUNTS" },
  { path: "/admin/users", label: "用户管理", sub: "USERS" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout, isLeader } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-ink/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 lg:w-[280px] flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto",
          "bg-[#0F172A] text-[#94A3B8]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="px-6 pt-8 pb-6">
          <h1 className="font-serif text-[22px] font-bold text-white tracking-tight leading-tight">
            矩阵罗盘
          </h1>
          <p className="font-mono mt-1.5 text-[#475569] text-[11px] tracking-[0.18em] uppercase">
            MATRIX COMPASS
          </p>
        </div>

        <div className="mx-6 border-t border-[#1E293B]" />

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
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
        <div className="px-4 py-4 border-t border-[#1E293B]">
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
      </aside>
    </>
  );
}
