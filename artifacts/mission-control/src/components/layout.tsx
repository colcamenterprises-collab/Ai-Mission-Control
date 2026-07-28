import { Link, useLocation } from "wouter";
import { Bot, Gauge, Library, ListTodo, Settings } from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import "./sidebar-accordion.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
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
        className={`mission-nav-item ${isActive ? "mission-nav-active" : ""}`}
      >
        <Icon className="mission-nav-icon" />
        <span className="sr-only">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />
      <aside className="mission-sidebar relative z-10 flex-shrink-0 flex flex-col">
        <div className="mission-sidebar-top">
          <CustomliLogo compact />
        </div>
        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <ul className="space-y-1">
            {navItems.map((item) => <li key={item.href}>{renderNavItem(item)}</li>)}
          </ul>
        </nav>
      </aside>
      <main className="mission-main-canvas relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
