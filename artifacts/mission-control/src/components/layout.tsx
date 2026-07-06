import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  CheckSquare,
  PenTool,
  CalendarDays,
  BrainCircuit,
  Users,
  UsersRound,
  Settings,
  Activity,
  Boxes,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { jamesIdentity } from "@/lib/agent-identities";
import { JamesAvatar } from "@/components/james-avatar";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/content", label: "Content", icon: PenTool },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/memory", label: "Memory", icon: BrainCircuit },
    { href: "/workspaces", label: "Workspaces", icon: Boxes },
    { href: "/team", label: "Team", icon: Users },
    { href: "/contacts", label: "Contacts", icon: UsersRound },
    { href: "/james", label: "Orchestrator", avatar: jamesIdentity.avatar },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      <aside
        className={`${isCollapsed ? "w-[4.25rem]" : "w-44 md:w-48"} border-r border-border bg-sidebar flex-shrink-0 flex flex-col transition-[width] duration-200`}
      >
        <div
          className={`h-12 flex items-center border-b border-border gap-2 ${isCollapsed ? "justify-center px-2" : "px-3"}`}
        >
          <Activity className="w-4 h-4 text-primary flex-shrink-0" />
          {!isCollapsed && (
            <span className="font-mono font-bold tracking-tight text-[0.7rem] uppercase flex-1 truncate">
              MISSION CONTROL
            </span>
          )}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5 px-1.5">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center ${isCollapsed ? "justify-center px-2" : "px-2"} py-1.5 text-xs rounded-md transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    {"avatar" in item ? (
                      <JamesAvatar
                        className={`${isCollapsed ? "" : "mr-2"} h-4 w-4 flex-shrink-0 rounded-full object-cover ring-1 ${isActive ? "ring-primary/40" : "ring-sidebar-border"}`}
                        fallbackClassName={
                          isActive ? "text-primary" : "text-muted-foreground"
                        }
                      />
                    ) : (
                      <item.icon
                        className={`w-3.5 h-3.5 ${isCollapsed ? "" : "mr-2"} flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      />
                    )}
                    {!isCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div
          className={`${isCollapsed ? "p-2" : "p-2.5"} border-t border-border text-[0.62rem] text-muted-foreground font-mono`}
        >
          <button
            onClick={() => setIsCollapsed((value) => !value)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mb-2 flex h-7 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
          {!isCollapsed && (
            <>
              SYSTEM: ONLINE
              <br />
              STATUS: NOMINAL
            </>
          )}
        </div>
      </aside>
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}
