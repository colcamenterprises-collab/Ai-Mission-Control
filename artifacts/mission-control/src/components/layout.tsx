import { useState } from "react";
import { Link, useLocation } from "wouter";
import { PanelLeftClose, PanelLeftOpen, LayoutDashboard, ListTodo, Users, Library, Settings } from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import "./sidebar-accordion.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navItems: NavItem[] = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/team", label: "AI Team", icon: Users },
    { href: "/business", label: "Business Hub", icon: Library },
    { href: "/settings", label: "Setup", icon: Settings },
  ];

  function renderNavItem(item: NavItem) {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    return (
      <Link
        key={`${item.href}-${item.label}`}
        href={item.href}
        title={isCollapsed ? item.label : undefined}
        className={`mission-nav-item ${isCollapsed ? "mission-nav-collapsed" : ""} ${isActive ? "mission-nav-active" : ""}`}
      >
        <item.icon className="mission-nav-icon" />
        {!isCollapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />
      <aside className={`${isCollapsed ? "w-[5.5rem]" : "w-52"} mission-sidebar relative z-10 flex-shrink-0 flex flex-col transition-[width] duration-200`}>
        <div className={`mission-sidebar-top ${isCollapsed ? "justify-center px-2" : "px-4"}`}>
          <CustomliLogo compact={isCollapsed} />
          {!isCollapsed && <div className="mission-sidebar-status"><span /> Systems ready</div>}
        </div>
        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <ul className="space-y-1">
            {navItems.map((item) => <li key={item.href}>{renderNavItem(item)}</li>)}
          </ul>
        </nav>
        <div className={`${isCollapsed ? "p-2" : "p-3"} mission-sidebar-footer`}>
          <button onClick={() => setIsCollapsed((value) => !value)} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="mission-collapse-button">
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          {!isCollapsed && <span>Ready</span>}
        </div>
      </aside>
      <main className="mission-main-canvas relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
