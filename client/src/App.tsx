import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { trpc, createTRPCClient } from "./lib/trpc.js";
import { useAuth } from "./hooks/useAuth.js";
import AppShell from "./components/layout/AppShell.js";
import LoginPage from "./pages/LoginPage.js";
import ChangePasswordPage from "./pages/ChangePasswordPage.js";
import KanbanPage from "./pages/KanbanPage.js";
import DataEntryPage from "./pages/DataEntryPage.js";
import DataOverviewPage from "./pages/DataOverviewPage.js";
import ReviewPage from "./pages/ReviewPage.js";
import RecommendationPage from "./pages/RecommendationPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import AccountsPage from "./pages/AccountsPage.js";
import UsersPage from "./pages/UsersPage.js";
import TopicDetailPage from "./pages/TopicDetailPage.js";

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
    </AppShell>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
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
