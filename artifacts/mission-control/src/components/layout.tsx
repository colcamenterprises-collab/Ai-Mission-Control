import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Bot,
  BookOpenText,
  BriefcaseBusiness,
  ChevronLeft,
  FileText,
  Gauge,
  Inbox,
  Library,
  ListTodo,
  Search,
  Settings,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import "./sidebar-accordion.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type PlaceholderItem = Omit<NavItem, "href">;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches,
  );
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const navItems: NavItem[] = [
    { href: "/", label: "Home", icon: Gauge },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/team", label: "AI Team", icon: Bot },
    { href: "/business", label: "Business Hub", icon: Library },
    { href: "/settings", label: "Setup", icon: Settings },
  ];

  const otherItems: PlaceholderItem[] = [
    { label: "Documentation", icon: BookOpenText },
    { label: "Refer a Friend", icon: UserRoundPlus },
    { label: "Inbox", icon: Inbox },
    { label: "Reports", icon: FileText },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );
  const visibleOtherItems = useMemo(
    () => otherItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );

  useEffect(() => {
    const tabletQuery = window.matchMedia("(max-width: 1180px)");

    function syncSidebarToViewport(event: MediaQueryListEvent) {
      setIsCollapsed(event.matches);
    }

    tabletQuery.addEventListener("change", syncSidebarToViewport);
    return () => tabletQuery.removeEventListener("change", syncSidebarToViewport);
  }, []);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (isCollapsed) setIsCollapsed(false);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [isCollapsed]);

  function renderNavItem(item: NavItem) {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    const Icon = item.icon;
    return (
      <Link
        key={`${item.href}-${item.label}`}
        href={item.href}
        title={isCollapsed ? item.label : undefined}
        aria-label={item.label}
        className={`mission-nav-item ${isActive ? "mission-nav-active" : ""}`}
      >
        <Icon className="mission-nav-icon" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />
      <aside
        className={`mission-sidebar relative z-10 flex-shrink-0 flex flex-col ${
          isCollapsed ? "mission-sidebar-collapsed" : "mission-sidebar-expanded"
        }`}
      >
        <div className="mission-sidebar-top">
          <CustomliLogo compact={isCollapsed} />
          <button
            type="button"
            className="mission-collapse-button"
            onClick={() => setIsCollapsed((value) => !value)}
            aria-label={isCollapsed ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!isCollapsed}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>

        {!isCollapsed && (
          <label className="mission-sidebar-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              aria-label="Search navigation"
            />
            <span className="mission-search-shortcut">⌘ F</span>
          </label>
        )}

        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <ul>{visibleNavItems.map((item) => <li key={item.href}>{renderNavItem(item)}</li>)}</ul>

          {!isCollapsed && visibleOtherItems.length > 0 && (
            <div className="mission-other-nav">
              <span className="mission-nav-heading">Other</span>
              <ul>
                {visibleOtherItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        className="mission-nav-item mission-nav-placeholder"
                        title="Coming soon"
                        aria-label={`${item.label} — coming soon`}
                      >
                        <Icon className="mission-nav-icon" />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!isCollapsed && visibleNavItems.length === 0 && visibleOtherItems.length === 0 && (
            <p className="mission-nav-empty">No navigation matches “{query}”.</p>
          )}
        </nav>

        {!isCollapsed && (
          <div className="mission-sidebar-footer">
            <div className="mission-ai-boost">
              <div className="mission-ai-boost-title">
                <Sparkles aria-hidden="true" />
                <span>Boost with AI</span>
              </div>
              <p>Sharper automation, insights, and tools that save hours.</p>
              <button type="button" onClick={() => window.location.assign("/settings")}>
                Explore AI Setup
              </button>
            </div>
            <div className="mission-sidebar-account">
              <BriefcaseBusiness aria-hidden="true" />
              <div>
                <strong>Customli</strong>
                <span>Mission Control</span>
              </div>
            </div>
          </div>
        )}
      </aside>
      <main className="mission-main-canvas relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    </div>
  );
}
