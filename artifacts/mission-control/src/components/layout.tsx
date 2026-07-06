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
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { jamesIdentity } from "@/lib/agent-identities";
import { JamesAvatar } from "@/components/james-avatar";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/content", label: "Content", icon: PenTool },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/memory", label: "Memory", icon: BrainCircuit },
    { href: "/workspaces", label: "Workspaces", icon: Boxes },
    { href: "/team", label: "Team", icon: Users },
    { href: "/contacts", label: "Contacts", icon: UsersRound },
    { href: "/james", label: "James", avatar: jamesIdentity.avatar },
    { href: "/workspaces", label: "Workspaces", icon: Boxes },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      <div className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border gap-3">
          <Activity className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="font-mono font-bold tracking-tight text-sm uppercase flex-1 truncate">MISSION CONTROL</span>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link 
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                      isActive 
                        ? "bg-primary/10 text-primary font-medium" 
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    {"avatar" in item ? (
                      <JamesAvatar
                        className={`mr-3 h-5 w-5 flex-shrink-0 rounded-full object-cover ring-1 ${isActive ? "ring-primary/40" : "ring-sidebar-border"}`}
                        fallbackClassName={isActive ? "text-primary" : "text-muted-foreground"}
                      />
                    ) : (
                      <item.icon className={`w-4 h-4 mr-3 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
          SYSTEM: ONLINE<br/>
          STATUS: NOMINAL
        </div>
      </div>
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        {children}
      </main>
    </div>
  );
}
