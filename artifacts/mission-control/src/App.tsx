import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { TaskEnhancements } from "@/components/task-enhancements";
import { OperatingSurfaceEnhancements } from "@/components/operating-surface-enhancements";
import { KanbanReviewFixes } from "@/components/kanban-review-fixes";
import { ThemeProvider } from "@/lib/theme";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Notes from "@/pages/notes";
import ContentPipeline from "@/pages/content";
import Memory from "@/pages/memory";
import Workspaces from "@/pages/workspaces";
import Team from "@/pages/team";
import AgentCreation from "@/pages/agent-creation";
import Skills from "@/pages/skills";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import Secrets from "@/pages/secrets";
import MissionBrain from "@/pages/mission-brain";
import Contacts from "@/pages/contacts";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import Executions from "@/pages/executions";
import Signals from "@/pages/signals";
import ClientPulse from "@/pages/client-pulse";
import AgentOperations from "@/pages/agent-operations";
import "@/pages/notes-knowledge.css";
import "./visual-first.css";
import "./minimal-dark.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function TasksRoute() {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("create") === "note") {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.replace(`${base}/notes?create=note`);
    return null;
  }
  return <Tasks />;
}

function RedirectToTasks() {
  if (typeof window !== "undefined") {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.replace(`${base}/tasks`);
  }
  return null;
}

function RedirectToBrain() {
  if (typeof window !== "undefined") {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.replace(`${base}/brain`);
  }
  return null;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/notes" component={Notes} />
        <Route path="/tasks" component={TasksRoute} />
        <Route path="/content" component={ContentPipeline} />
        <Route path="/calendar" component={RedirectToTasks} />
        <Route path="/memory" component={Memory} />
        <Route path="/workspaces" component={Workspaces} />
        <Route path="/reports" component={Reports} />
        <Route path="/approvals" component={RedirectToTasks} />
        <Route path="/brain/executions/:id" component={Executions} />
        <Route path="/brain/executions" component={Executions} />
        <Route path="/brain" component={MissionBrain} />
        <Route path="/executions/:id" component={Executions} />
        <Route path="/executions" component={Executions} />
        <Route path="/business" component={RedirectToBrain} />
        <Route path="/signals" component={Signals} />
        <Route path="/client-pulse" component={ClientPulse} />
        <Route path="/agent-operations" component={AgentOperations} />
        <Route path="/reports-summary" component={Reports} />
        <Route path="/team" component={Team} />
        <Route path="/agent-creation" component={AgentCreation} />
        <Route path="/skills" component={Skills} />
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
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><Router /></WouterRouter>
          <TaskEnhancements />
          <OperatingSurfaceEnhancements />
          <KanbanReviewFixes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
