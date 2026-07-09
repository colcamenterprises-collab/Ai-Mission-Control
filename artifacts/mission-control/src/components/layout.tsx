import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  CheckSquare,
  PenTool,
  CalendarDays,
  Users,
  UsersRound,
  Settings,
  Activity,
  Boxes,
  BookOpen,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import { useTheme } from "@/lib/theme";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks + Chat", icon: CheckSquare },
    { href: "/team", label: "Agents", icon: Users },
    { href: "/memory", label: "Memory", icon: Activity },
    { href: "/skills", label: "Skills", icon: BookOpen },
    { href: "/workspaces", label: "Repos", icon: Boxes },
    { href: "/content", label: "Content", icon: PenTool },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/contacts", label: "Contacts", icon: UsersRound },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-orbital-background" aria-hidden="true">
        <span className="mission-orbit mission-orbit-one" />
        <span className="mission-orbit mission-orbit-two" />
        <span className="mission-orbit mission-orbit-three" />
        <span className="mission-orbit-core" />
      </div>
      <aside
        className={`${isCollapsed ? "w-[4.25rem]" : "w-44 md:w-48"} relative z-10 border-r border-white/10 bg-sidebar/80 backdrop-blur-xl flex-shrink-0 flex flex-col transition-[width] duration-200`}
      >
        <div
          className={`mission-sidebar-top ${isCollapsed ? "justify-center px-2" : "px-3"}`}
        >
          <CustomliLogo compact={isCollapsed} />
          {!isCollapsed && <div className="flex-1" />}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="theme-pill"
          >
            <span className={`theme-pill-thumb ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`} />
            <Sun className={`theme-pill-icon theme-pill-sun ${theme === "dark" ? "opacity-40" : "opacity-100"}`} />
            <Moon className={`theme-pill-icon theme-pill-moon ${theme === "dark" ? "opacity-100" : "opacity-40"}`} />
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
                    <item.icon
                      className={`w-3.5 h-3.5 ${isCollapsed ? "" : "mr-2"} flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                    />
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
      <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
