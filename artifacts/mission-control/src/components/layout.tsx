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
  BookOpen,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
} from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import { useTheme } from "@/lib/theme";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/tasks", label: "Work", icon: CheckSquare },
    { href: "/team", label: "AI Team", icon: Users },
    { href: "/memory", label: "Knowledge", icon: Activity },
    { href: "/skills", label: "Playbooks", icon: BookOpen },
    { href: "/content", label: "Marketing", icon: PenTool },
    { href: "/calendar", label: "Planner", icon: CalendarDays },
    { href: "/contacts", label: "Contacts", icon: UsersRound },
    { href: "/tasks", label: "Reports", icon: BarChart3 },
    { href: "/settings", label: "Setup", icon: Settings },
  ];

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <aside
        className={`${isCollapsed ? "w-[4.5rem]" : "w-52"} mission-sidebar relative z-10 flex-shrink-0 flex flex-col transition-[width] duration-200`}
      >
        <div
          className={`mission-sidebar-top ${isCollapsed ? "justify-center px-3" : "px-5"}`}
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
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <li key={`${item.href}-${item.label}`}>
                  <Link
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    className={`mission-nav-item ${isCollapsed ? "justify-center px-2" : "px-3"} ${isActive ? "mission-nav-active" : ""}`}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!isCollapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={`${isCollapsed ? "p-3" : "p-4"} mission-sidebar-footer`}>
          <button
            onClick={() => setIsCollapsed((value) => !value)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mission-collapse-button"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          {!isCollapsed && <span>Workspace ready</span>}
        </div>
      </aside>
      <main className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
