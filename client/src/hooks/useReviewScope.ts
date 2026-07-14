import { useMemo } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "./useAuth.js";

export interface ReviewScopeFields {
  scope: string;
  accountIds: number[] | null;
  accountId: number | null;
}

/**
 * 复盘报告「范围」展示逻辑——复盘页与下期调整页共用，确保标签口径一致。
 * - 负责人在全部账号中识别简称；老师/编辑在自己名下账号中识别。空选 = 全矩阵。
 * - scopeLabel：全矩阵→「全矩阵」；否则写明所选账号简称（账号名前 3 个字，如「途洋日」）。
 * - accountFullNames：返回所选账号全称（详情头部「账号：…」用，含 #id 兜底）。
 */
export function useReviewScope() {
  const { isLeader } = useAuth();

  const leaderAccountsQuery = trpc.account.listActive.useQuery(undefined, {
    enabled: isLeader,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const ownerAccountsQuery = trpc.account.listByOwner.useQuery(undefined, {
    enabled: !isLeader,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const accountOptions = (isLeader ? leaderAccountsQuery.data : ownerAccountsQuery.data) || [];

  const accountNameMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const a of accountOptions) m[a.id] = a.accountName;
    return m;
  }, [accountOptions]);

  // 报告涉及的账号 id：优先多账号数组，回退单账号；空 = 全矩阵
  const resolveIds = (r: ReviewScopeFields): number[] =>
    r.accountIds && r.accountIds.length > 0 ? r.accountIds : r.accountId ? [r.accountId] : [];

  // 列表/下拉里报告的范围标签：全矩阵原样显示；否则写明所选账号简称（账号名前 3 个字）。
  const scopeLabel = (r: ReviewScopeFields): string => {
    const ids = resolveIds(r);
    if (r.scope === "matrix" || ids.length === 0) return "全矩阵";
    const names = ids.map((id) => accountNameMap[id]).filter(Boolean) as string[];
    // 账号名尚未加载齐全时回退到通用标签，避免出现 #id
    if (names.length !== ids.length) return r.scope === "multi" ? "多账号" : "单号";
    return names.map((n) => n.slice(0, 3)).join("、");
  };

  // 详情头部用的账号全称列表（含 #id 兜底）
  const accountFullNames = (r: ReviewScopeFields): string[] =>
    resolveIds(r).map((id) => accountNameMap[id] || `#${id}`);

  return { accountOptions, accountNameMap, scopeLabel, resolveIds, accountFullNames };
}
