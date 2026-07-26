import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, LayoutDashboard, ListTodo, Users, FileText, Brain, BookOpen, Zap, Boxes, Megaphone, CalendarDays, ContactRound, Settings } from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import "./sidebar-accordion.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Operations: true,
    Tools: true,
  });

  const homeItem: NavItem = { href: "/", label: "Overview", icon: LayoutDashboard };

  const navGroups: NavGroup[] = [
    {
      label: "Operations",
      items: [
        { href: "/tasks", label: "Work", icon: ListTodo },
        { href: "/agent-creation", label: "AI Team", icon: Users },
        { href: "/reports", label: "Reports", icon: FileText },
        { href: "/workspaces", label: "Projects", icon: Boxes },
      ],
    },
    {
      label: "Tools",
      items: [
        { href: "/memory", label: "Knowledge", icon: Brain },
        { href: "/skills", label: "Playbooks", icon: BookOpen },
        { href: "/settings", label: "Automations & setup", icon: Zap },
        { href: "/content", label: "Marketing", icon: Megaphone },
        { href: "/calendar", label: "Planner", icon: CalendarDays },
        { href: "/contacts", label: "People", icon: ContactRound },
      ],
    },
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

  function toggleGroup(label: string) {
    setOpenGroups((current) => ({ ...current, [label]: !current[label] }));
  }

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />
      <aside className={`${isCollapsed ? "w-[4.25rem]" : "w-48 lg:w-52"} mission-sidebar relative z-10 flex-shrink-0 flex flex-col transition-[width] duration-200`}>
        <div className={`mission-sidebar-top ${isCollapsed ? "justify-center px-2" : "px-4"}`}>
          <CustomliLogo compact={isCollapsed} />
          {!isCollapsed && <div className="mission-sidebar-status"><span /> Systems ready</div>}
        </div>
        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <div className="mission-nav-home">
            {renderNavItem(homeItem)}
          </div>
          {navGroups.map((group) => {
            const isOpen = isCollapsed ? false : openGroups[group.label];
            return (
              <div key={group.label} className={`mission-nav-group ${isOpen ? "is-open" : "is-closed"}`}>
                {!isCollapsed && (
                  <button
                    type="button"
                    className="mission-nav-group-trigger"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                  >
                    <span>{group.label}</span>
                    <ChevronDown className="mission-nav-chevron" />
                  </button>
                )}
                {isOpen && (
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li key={`${item.href}-${item.label}`}>
                        {renderNavItem(item)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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
