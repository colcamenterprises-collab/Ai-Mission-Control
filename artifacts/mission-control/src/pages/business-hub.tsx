import { Link } from "wouter";
import { Brain, BookOpen, Boxes, Users } from "lucide-react";
import "./workspaces.css";

const areas = [
  { href: "/memory", label: "Knowledge", icon: Brain },
  { href: "/skills", label: "Playbooks", icon: BookOpen },
  { href: "/workspaces", label: "Projects", icon: Boxes },
  { href: "/contacts", label: "People", icon: Users },
];

export default function BusinessHub() {
  return (
    <div className="workspaces-shell h-full overflow-y-auto">
      <div className="workspaces-canvas space-y-4">
        <header className="work-hero">
          <div><p>Business Hub</p><h1>Everything agents need.</h1></div>
        </header>
        <section className="grid gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <Link key={area.href} href={area.href} className="workspace-panel flex items-center gap-4 p-5 transition hover:border-primary/40">
              <area.icon className="h-6 w-6 text-primary" />
              <strong>{area.label}</strong>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
