import { useAuth } from "../hooks/useAuth.js";
import { trpc } from "../lib/trpc.js";

/**
 * 负责人代理登录横幅。
 * 仅当处于「登录为该用户」状态时显示，悬浮在底部居中，提供一键返回负责人本人账户。
 */
export default function ImpersonationBanner() {
  const { user, impersonator } = useAuth();
  const stop = trpc.auth.stopImpersonating.useMutation({
    onSuccess: () => window.location.assign("/"),
    onError: (e) => window.alert(e.message || "退出代理登录失败"),
  });

  if (!impersonator || !user) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#92400E] text-white px-4 py-2.5 rounded-full shadow-lg text-sm max-w-[92vw]">
      <span className="truncate">
        ⚠️ 你（{impersonator.name}）正在以 <span className="font-bold">{user.name}</span> 的身份操作
      </span>
      <button
        onClick={() => !stop.isPending && stop.mutate()}
        disabled={stop.isPending}
        className="shrink-0 bg-white text-[#92400E] px-3 py-1 rounded-full font-medium hover:bg-[#FEF3C7] disabled:opacity-50 transition-colors"
      >
        {stop.isPending ? "返回中..." : "返回我的账户"}
      </button>
    </div>
  );
}
