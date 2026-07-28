import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Bot, Gauge, Library, ListTodo, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
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
    { href: "/", label: "Overview", icon: Gauge },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/team", label: "AI Team", icon: Bot },
    { href: "/business", label: "Business Hub", icon: Library },
    { href: "/settings", label: "Setup", icon: Settings },
  ];

  function renderNavItem(item: NavItem) {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    const Icon = item.icon;
    return (
      <Link
        key={`${item.href}-${item.label}`}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        className={`mission-nav-item ${isCollapsed ? "mission-nav-collapsed" : ""} ${isActive ? "mission-nav-active" : ""}`}
      >
        <Icon className="mission-nav-icon" />
        <span className="sr-only">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />
      <aside className={`${isCollapsed ? "mission-sidebar-collapsed" : "mission-sidebar-expanded"} mission-sidebar relative z-10 flex-shrink-0 flex flex-col transition-[width] duration-200`}>
        <div className={`mission-sidebar-top ${isCollapsed ? "justify-center px-2" : "px-4"}`}>
          <CustomliLogo compact={isCollapsed} />
        </div>
        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <ul className="space-y-1">
            {navItems.map((item) => <li key={item.href}>{renderNavItem(item)}</li>)}
          </ul>
        </nav>
        <div className={`${isCollapsed ? "p-2" : "p-3"} mission-sidebar-footer`}>
          <button onClick={() => setIsCollapsed((value) => !value)} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="mission-collapse-button">
            {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
      </aside>
      <main className="mission-main-canvas relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
