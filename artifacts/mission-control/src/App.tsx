import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { ThemeProvider } from "@/lib/theme";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import ContentPipeline from "@/pages/content";
import Memory from "@/pages/memory";
import Workspaces from "@/pages/workspaces";
import Team from "@/pages/team";
import Skills from "@/pages/skills";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import Secrets from "@/pages/secrets";
import BusinessHub from "@/pages/business-hub";
import Contacts from "@/pages/contacts";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import "./visual-first.css";
import "./minimal-dark.css";

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
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/content" component={ContentPipeline} />
        <Route path="/calendar">{() => { window.location.replace("/tasks"); return null; }}</Route>
        <Route path="/memory" component={Memory} />
        <Route path="/workspaces" component={Workspaces} />
        <Route path="/reports" component={Reports} />
        <Route path="/reports-summary" component={Reports} />
        <Route path="/team" component={Team} />
        <Route path="/agent-creation" component={Team} />
        <Route path="/skills" component={Skills} />
        <Route path="/business" component={BusinessHub} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/secrets" component={Secrets} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/settings" component={Settings} />
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
