import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { trpc, createTRPCClient } from "./lib/trpc.js";
import { useAuth } from "./hooks/useAuth.js";
import AppShell from "./components/layout/AppShell.js";
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

// Prefetch page chunks after initial render so they're cached for instant navigation
function usePrefetchRoutes() {
  useEffect(() => {
    const timer = setTimeout(() => {
      import("./pages/TopicDetailPage.js");
      import("./pages/TrashPage.js");
      import("./pages/DataEntryPage.js");
      import("./pages/RecommendationPage.js");
      import("./pages/ReviewPage.js");
      import("./pages/DataOverviewPage.js");
      import("./pages/DashboardPage.js");
      import("./pages/AccountsPage.js");
      import("./pages/UsersPage.js");
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
}

// Prefetch API data that slow pages need, so it's cached before navigation
function usePrefetchData() {
  const utils = trpc.useUtils();
  useEffect(() => {
    const timer = setTimeout(() => {
      utils.topic.listDeleted.prefetch();
      utils.note.listForDataEntry.prefetch();
      utils.event.upcoming.prefetch({ days: 365 });
      utils.review.listRecommendations.prefetch({ limit: 5 });
      utils.review.list.prefetch({ type: "weekly", limit: 5 });
      utils.dashboard.overview.prefetch();
      utils.dashboard.rankings.prefetch({ period: "30" });
    }, 500);
    return () => clearTimeout(timer);
  }, [utils]);
}

function AppRoutes() {
  const { user, isLoading, isTeacher, selectedAccountId } = useAuth();

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

  // Teachers must select an account before entering the app
  if (isTeacher && !selectedAccountId) {
    return <AccountSelectPage />;
  }

  return (
    <AppShell>
      <Prefetcher />
      <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted">加载中...</div>}>
        <Switch>
          <Route path="/" component={KanbanPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/trash" component={TrashPage} />
          <Route path="/topic/:id" component={TopicDetailPage} />
          <Route path="/data-entry" component={DataEntryPage} />
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
    </AppShell>
  );
}

function Prefetcher() {
  usePrefetchRoutes();
  usePrefetchData();
  return null;
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
