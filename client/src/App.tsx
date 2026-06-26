import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { trpc, createTRPCClient } from "./lib/trpc.js";
import { useAuth } from "./hooks/useAuth.js";
import AppShell from "./components/layout/AppShell.js";
import ImpersonationBanner from "./components/ImpersonationBanner.js";
import ErrorBoundary from "./components/ErrorBoundary.js";
import LoginPage from "./pages/LoginPage.js";
import ChangePasswordPage from "./pages/ChangePasswordPage.js";
import AccountSelectPage from "./pages/AccountSelectPage.js";

// Lazy load all authenticated pages — only download when navigated to
const KanbanPage = lazy(() => import("./pages/KanbanPage.js"));
const DataEntryPage = lazy(() => import("./pages/DataEntryPage.js"));
const DataOverviewPage = lazy(() => import("./pages/DataOverviewPage.js"));
const ReviewPage = lazy(() => import("./pages/ReviewPage.js"));
const RecommendationPage = lazy(() => import("./pages/RecommendationPage.js"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.js"));
const AccountsPage = lazy(() => import("./pages/AccountsPage.js"));
const UsersPage = lazy(() => import("./pages/UsersPage.js"));
const TopicDetailPage = lazy(() => import("./pages/TopicDetailPage.js"));
const TypesPage = lazy(() => import("./pages/TypesPage.js"));
const CalendarPage = lazy(() => import("./pages/CalendarPage.js"));
const TrashPage = lazy(() => import("./pages/TrashPage.js"));
const AutoFetchPage = lazy(() => import("./pages/AutoFetchPage.js"));

// Prefetch page chunks after initial render so they're cached for instant navigation
function usePrefetchRoutes() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // 预取全部懒加载页面的 JS chunk，点击任意菜单都能秒开
      import("./pages/KanbanPage.js");
      import("./pages/CalendarPage.js");
      import("./pages/TopicDetailPage.js");
      import("./pages/TrashPage.js");
      import("./pages/DataEntryPage.js");
      import("./pages/AutoFetchPage.js");
      import("./pages/DataOverviewPage.js");
      import("./pages/ReviewPage.js");
      import("./pages/RecommendationPage.js");
      import("./pages/DashboardPage.js");
      import("./pages/AccountsPage.js");
      import("./pages/UsersPage.js");
      import("./pages/TypesPage.js");
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
}

// 数据预取暂时停用：用于排查"所有页面变慢"问题，先把预取从变量中排除，
// 得到一个干净基线。若停用后仍慢，则说明是后端/数据库本身，与预取无关。
// 确认基线正常后，再考虑用更克制的方式（或改为后端查询优化）重新引入。
function usePrefetchData() {
  // no-op
}

function AppRoutes() {
  const { user, isLoading, isTeacher, selectedAccountId } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  let content: ReactNode;
  if (user.mustChangePassword) {
    content = <ChangePasswordPage />;
  } else if (isTeacher && !selectedAccountId) {
    // Teachers must select an account before entering the app
    content = <AccountSelectPage />;
  } else {
    content = (
      <AppShell>
        <Prefetcher />
        <ErrorBoundary key={location}>
        <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted">加载中...</div>}>
          <Switch>
            <Route path="/" component={KanbanPage} />
            <Route path="/calendar" component={CalendarPage} />
            <Route path="/trash" component={TrashPage} />
            <Route path="/topic/:id" component={TopicDetailPage} />
            <Route path="/data-entry" component={DataEntryPage} />
            <Route path="/auto-fetch" component={AutoFetchPage} />
            <Route path="/data-overview" component={DataOverviewPage} />
            <Route path="/reviews" component={ReviewPage} />
            <Route path="/recommendations" component={RecommendationPage} />
            {!isTeacher && <Route path="/dashboard" component={DashboardPage} />}
            {!isTeacher && <Route path="/admin/accounts" component={AccountsPage} />}
            {!isTeacher && <Route path="/admin/users" component={UsersPage} />}
            {!isTeacher && <Route path="/admin/types" component={TypesPage} />}
            <Route>
              <div className="text-center py-20 text-gray-400">页面不存在</div>
            </Route>
          </Switch>
        </Suspense>
        </ErrorBoundary>
      </AppShell>
    );
  }

  // 代理登录横幅在所有已登录界面（含账号选择页）上方悬浮显示
  return (
    <>
      <ImpersonationBanner />
      {content}
    </>
  );
}

function Prefetcher() {
  usePrefetchRoutes();
  usePrefetchData();
  return null;
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30 * 60 * 1000, // 30 分钟内视为新鲜，不重新请求
        gcTime: 60 * 60 * 1000,    // 缓存保留 1 小时，避免离开页面 5 分钟后被回收导致重新加载
      },
    },
  }));
  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
