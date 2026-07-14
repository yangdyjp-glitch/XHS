import { useLocation } from "wouter";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";

export default function AccountSelectPage() {
  const { user, setSelectedAccountId, logout } = useAuth();
  const [, navigate] = useLocation();

  const selectAccount = (id: number) => {
    setSelectedAccountId(id);
    navigate("/");
  };
  const accountsQuery = trpc.account.listByOwner.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const accounts = accountsQuery.data || [];

  // Auto-select if only one account
  if (accounts.length === 1 && !accountsQuery.isLoading) {
    selectAccount(accounts[0].id);
    return null;
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-[28px] font-bold text-ink">矩阵罗盘</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted mt-1 uppercase">
            MATRIX COMPASS
          </p>
        </div>

        <div className="card-surface p-6">
          <p className="eyebrow mb-1">ACCOUNT</p>
          <h2 className="font-serif font-bold text-lg text-ink mb-1">选择工作账号</h2>
          <p className="text-sm text-muted mb-5">
            你好，{user?.name}。请选择要操作的小红书账号：
          </p>

          {accountsQuery.isLoading ? (
            <p className="text-sm text-muted font-serif italic text-center py-8">加载中...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted font-serif italic text-center py-8">
              暂无关联账号，请联系管理员分配
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => selectAccount(acc.id)}
                  className="w-full card-surface p-4 text-left hover:bg-[#F0F4FA] transition-colors flex items-center gap-3 group"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: acc.mainColor || "#CBD5E1" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink group-hover:text-accent transition-colors">
                      {acc.accountName}
                    </div>
                    <div className="text-xs text-muted font-mono mt-0.5">
                      {acc.weeklyTarget}篇/周
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-muted group-hover:text-accent shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <button
            onClick={logout}
            className="text-sm text-muted hover:text-[#991B1B] transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
