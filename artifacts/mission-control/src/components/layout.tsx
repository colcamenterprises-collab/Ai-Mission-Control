import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BookOpen, Brain, ChevronDown, ChevronLeft, ClipboardList,
  Command as CommandIcon, Gauge, History, LogOut, Menu,
  Search, Settings2, ShieldCheck, StickyNote, UsersRound,
} from "lucide-react";
import { CustomliLogo } from "@/components/customli-logo";
import { useOwnerAuth } from "@/components/auth-gate";
import GlobalQuickActions from "@/components/global-quick-actions";
import "./sidebar-accordion.css";
import "./ui-cleanup.css";
import "./page-consistency.css";
import "./header-icon-policy.css";
import "./employee-factory-nav.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/tasks", label: "Taskboard", icon: ClipboardList },
  { href: "/notes", label: "Notes & Ideas", icon: StickyNote },
];
const teamNav: NavItem[] = [
  { href: "/team", label: "AI Team", icon: UsersRound },
  { href: "/skills", label: "Skills & Instructions", icon: BookOpen },
  { href: "/agent-operations", label: "Agent Operations", icon: ShieldCheck },
  { href: "/team/executions", label: "Execution History", icon: History },
];

const brainNav: NavItem = { href: "/brain", label: "Mission Brain", icon: Brain };
const settingsNav: NavItem = { href: "/settings", label: "Settings", icon: Settings2 };

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useOwnerAuth();
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches,
  );
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(
    () => teamNav.some((item) => location === item.href || location.startsWith(`${item.href}/`)),
  );
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const collapsed = isCollapsed && !isMobile;
  const normalizedQuery = query.trim().toLowerCase();

  const visiblePrimary = useMemo(
    () => primaryNav.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );
  const visibleTeam = useMemo(
    () => teamNav.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  );
  const showTeam =
    !normalizedQuery || "team".includes(normalizedQuery) || visibleTeam.length > 0;
  const showBrain =
    !normalizedQuery || brainNav.label.toLowerCase().includes(normalizedQuery);

  useEffect(() => {
    const desktopMq = window.matchMedia("(max-width: 1180px)");
    const mobileMq = window.matchMedia("(max-width: 760px)");
    const syncDesktop = (event: MediaQueryListEvent) => setIsCollapsed(event.matches);
    const syncMobile = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) setMobileOpen(false);
    };
    desktopMq.addEventListener("change", syncDesktop);
    mobileMq.addEventListener("change", syncMobile);
    return () => {
      desktopMq.removeEventListener("change", syncDesktop);
      mobileMq.removeEventListener("change", syncMobile);
    };
  }, []);
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
    if (teamNav.some((item) => location === item.href || location.startsWith(`${item.href}/`))) {
      setTeamOpen(true);
    }
  }, [location, isMobile]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (collapsed) setIsCollapsed(false);
        if (isMobile) setMobileOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        if (isMobile) setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [collapsed, isMobile]);

  function renderNavItem(item: NavItem, nested = false) {
    const active =
      location === item.href ||
      (item.href !== "/" && location.startsWith(`${item.href}/`));
    const Icon = item.icon;
    return (
      <Link
        key={`${item.href}-${item.label}`}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        onClick={() => {
          if (isMobile) setMobileOpen(false);
        }}
        className={`mission-nav-item ${nested ? "mission-nav-child" : ""} ${active ? "mission-nav-active" : ""}`}
      >
        <Icon className="mission-nav-icon" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  const routeClass =
    location === "/" ? "dashboard" : location.split("/")[1] || "dashboard";
  const commands = [
    ["Talk to James", "/james"],
    ["Quick Note", "/notes?create=note"],
    ["Add Idea", "/notes?create=idea"],
    ["Add Task", "/tasks?create=task"],
    ["Task approvals & review", "/tasks"],
    ["Hire AI Employee", "/team?hire=1"],
    ["AI Team", "/team"],
    ["Skills & Instructions", "/skills"],
    ["Execution History", "/team/executions"],
    ["Mission Brain", "/brain"],
    ["Settings", "/settings"],
  ];

  return (
    <div className="mission-app-bg relative min-h-screen overflow-hidden flex text-foreground">
      <div className="mission-premium-background" aria-hidden="true" />

      {isMobile && (
        <button
          type="button"
          className="mission-mobile-menu-button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open Mission Control menu"
        >
          <Menu />
        </button>
      )}
      {isMobile && mobileOpen && (
        <button
          type="button"
          className="mission-mobile-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close Mission Control menu"
        />
      )}

      <aside
        className={`mission-sidebar relative z-10 flex-shrink-0 flex flex-col ${collapsed ? "mission-sidebar-collapsed" : "mission-sidebar-expanded"} ${isMobile ? "mission-sidebar-mobile" : ""} ${mobileOpen ? "mission-sidebar-mobile-open" : ""}`}
      >
        <div className="mission-sidebar-top">
          <CustomliLogo compact={collapsed} />
        </div>

        {!collapsed && (
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
            {visiblePrimary.map((item) => (
              <li key={item.href}>{renderNavItem(item)}</li>
            ))}
          </ul>

          {showTeam && (
            <div className={`mission-nav-group ${teamOpen || normalizedQuery ? "is-open" : "is-closed"}`}>
              {collapsed ? (
                renderNavItem({ href: "/team", label: "Team", icon: UsersRound })
              ) : (
                <button
                  type="button"
                  className="mission-nav-group-trigger mission-nav-parent"
                  onClick={() => setTeamOpen((value) => !value)}
                  aria-expanded={teamOpen || Boolean(normalizedQuery)}
                >
                  <span className="mission-nav-parent-label">
                    <UsersRound className="mission-nav-icon" /> Team
                  </span>
                  <ChevronDown className="mission-nav-chevron" />
                </button>
              )}
              {!collapsed && (teamOpen || Boolean(normalizedQuery)) && (
                <ul>
                  {visibleTeam.map((item) => (
                    <li key={item.href}>{renderNavItem(item, true)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {showBrain && (
            <ul className="mission-nav-brain">
              <li>{renderNavItem(brainNav)}</li>
            </ul>
          )}

          {!collapsed &&
            normalizedQuery &&
            visiblePrimary.length === 0 &&
            visibleTeam.length === 0 &&
            !showBrain && (
              <p className="mission-nav-empty">No menu matches “{query}”.</p>
            )}
        </nav>

        <div className="mission-sidebar-utility">{renderNavItem(settingsNav)}</div>
        <div className="mission-sidebar-toggle-dock">
          <button
            type="button"
            className="mission-collapse-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mission-collapse-button"
            aria-label="Open command palette"
            title="Open command palette"
            onClick={() => setPaletteOpen(true)}
          >
            <CommandIcon aria-hidden="true" />
          </button>
          {!isMobile && (
            <button
              type="button"
              className="mission-collapse-button mission-collapse-button-bottom"
              onClick={() => setIsCollapsed((value) => !value)}
              aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Open sidebar" : "Close sidebar"}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      <main
        className={`mission-main-canvas mission-route-${routeClass} relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent`}
      >
        {children}
      </main>
      <GlobalQuickActions />

      {paletteOpen && (
        <div
          className="fixed inset-0 z-[1300] grid place-items-start bg-black/60 p-4 pt-[10vh]"
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
              <button onClick={() => setPaletteOpen(false)} aria-label="Close command palette">
                Close
              </button>
            </div>
            <div className="grid gap-1">
              {commands.map(([label, href]) => (
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
