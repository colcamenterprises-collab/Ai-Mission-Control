import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ClipboardList,
  Gauge,
  History,
  ShieldCheck,
  Command as CommandIcon,
  Search,
  Settings2,
  UsersRound,
} from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import "./sidebar-accordion.css";
import "./ui-cleanup.css";
import "./page-consistency.css";
import "./header-icon-policy.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1180px)").matches,
  );
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: Gauge },
    { href: "/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/team", label: "AI Team", icon: UsersRound },
    { href: "/business", label: "Business", icon: BriefcaseBusiness },
    { href: "/approvals", label: "Needs Cameron", icon: ShieldCheck },
    { href: "/executions", label: "Executions", icon: History },
    { href: "/settings", label: "Settings", icon: Settings2 },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  useEffect(() => {
    const tabletQuery = window.matchMedia("(max-width: 1180px)");
    function syncSidebarToViewport(event: MediaQueryListEvent) {
      setIsCollapsed(event.matches);
    }
    tabletQuery.addEventListener("change", syncSidebarToViewport);
    return () =>
      tabletQuery.removeEventListener("change", syncSidebarToViewport);
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function renderNavItem(item: NavItem) {
    const isActive =
      location === item.href ||
      (item.href !== "/" && location.startsWith(item.href));
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
        {!isCollapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  const routeClass =
    location === "/" ? "dashboard" : location.split("/")[1] || "dashboard";

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
        </div>

        {!isCollapsed && (
          <label className="mission-sidebar-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu"
              aria-label="Search navigation"
            />
          </label>
        )}

        <nav className="mission-sidebar-nav" aria-label="Main navigation">
          <ul>
            {visibleNavItems.map((item) => (
              <li key={item.href}>{renderNavItem(item)}</li>
            ))}
          </ul>
          {!isCollapsed && visibleNavItems.length === 0 && (
            <p className="mission-nav-empty">No menu matches “{query}”.</p>
          )}
        </nav>

        <div className="mission-sidebar-toggle-dock">
          <button
            type="button"
            className="mission-collapse-button"
            aria-label="Open command palette"
            title="Open command palette"
            onClick={() => setPaletteOpen(true)}
          >
            <CommandIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mission-collapse-button mission-collapse-button-bottom"
            onClick={() => setIsCollapsed((value) => !value)}
            aria-label={isCollapsed ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? "Open sidebar" : "Close sidebar"}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main
        className={`mission-main-canvas mission-route-${routeClass} relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent`}
      >
        {children}
      </main>
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-start bg-black/60 p-4 pt-[10vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Mission Control commands"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="mx-auto w-full max-w-xl rounded-xl border border-border bg-card p-3 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <strong>Mission Control</strong>
              <button
                onClick={() => setPaletteOpen(false)}
                aria-label="Close command palette"
              >
                Close
              </button>
            </div>
            <div className="grid gap-1">
              {[
                ["Ask James", "/tasks"],
                ["Create Task", "/tasks"],
                ["Search Mission Control", "/executions"],
                ["Search Memory", "/memory"],
                ["Open Business", "/business"],
                ["Open Project or Repository", "/workspaces"],
                ["Needs Cameron", "/approvals"],
                ["Open Agent", "/agent-operations"],
                ["View Running or Failed Work", "/executions"],
                ["Skills and Playbooks", "/skills"],
                ["Signals", "/signals"],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setPaletteOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
