import { useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { trpc, createTRPCClient } from "./lib/trpc.js";
import { useAuth } from "./hooks/useAuth.js";
import AppShell from "./components/layout/AppShell.js";
import LoginPage from "./pages/LoginPage.js";
import ChangePasswordPage from "./pages/ChangePasswordPage.js";

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

function AppRoutes() {
  const { user, isLoading } = useAuth();

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

  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return (
    <AppShell>
      <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted">加载中...</div>}>
        <Switch>
          <Route path="/" component={KanbanPage} />
          <Route path="/topic/:id" component={TopicDetailPage} />
          <Route path="/data-entry" component={DataEntryPage} />
          <Route path="/data-overview" component={DataOverviewPage} />
          <Route path="/reviews" component={ReviewPage} />
          <Route path="/recommendations" component={RecommendationPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/admin/accounts" component={AccountsPage} />
          <Route path="/admin/users" component={UsersPage} />
          <Route>
            <div className="text-center py-20 text-gray-400">页面不存在</div>
          </Route>
        </Switch>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30 * 60 * 1000 } },
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
