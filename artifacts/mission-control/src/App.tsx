import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { ThemeProvider } from "@/lib/theme";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import ContentPipeline from "@/pages/content";
import Calendar from "@/pages/calendar";
import Memory from "@/pages/memory";
import Team from "@/pages/team";
import Contacts from "@/pages/contacts";
import Settings from "@/pages/settings";
import James from "@/pages/james";
import Workspaces from "@/pages/workspaces";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/content" component={ContentPipeline} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/memory" component={Memory} />
        <Route path="/team" component={Team} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/settings" component={Settings} />
        <Route path="/james" component={James} />
        <Route path="/workspaces" component={Workspaces} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
