import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Settings2, Sparkles } from "lucide-react";
import { useListAgents, type Agent } from "@workspace/api-client-react";
import AgentCreation from "@/pages/agent-creation";
import { Skeleton } from "@/components/ui/skeleton";
import "./team-unified.css";

type EmployeeProfile = {
  agentId: number;
  projectId?: number | null;
  projectName?: string | null;
  avatarUrl?: string | null;
};

function statusLabel(agent: Agent) {
  if (agent.status === "active") return "Working";
  if (agent.status === "pending") return "Starting";
  if (agent.status === "error") return "Needs attention";
  return "Ready";
}

function initials(agent: Agent) {
  return agent.avatarInitials || agent.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function TeamUnified() {
  const [, navigate] = useLocation();
  const { data: agents = [], isLoading } = useListAgents();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const hireMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hire") === "1";

  useEffect(() => {
    fetch("/api/employee-factory/profiles", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setProfiles(Array.isArray(rows) ? rows : []))
      .catch(() => setProfiles([]));
  }, [agents.length]);

  const profileByAgent = useMemo(() => new Map(profiles.map((profile) => [profile.agentId, profile])), [profiles]);
  const visibleAgents = agents.slice(0, 5);
  const emptySlots = Math.max(0, 5 - visibleAgents.length);

  return (
    <div className="team-unified-shell">
      <div className="team-unified-canvas">
        <header className="team-unified-header">
          <div>
            <span className="team-unified-eyebrow"><Sparkles aria-hidden="true" /> AI Team</span>
            <h1>Your AI employees</h1>
          </div>
          <Link href="/team/manage" className="team-manage-link"><Settings2 aria-hidden="true" /> Manage</Link>
        </header>

        <section className="team-five-grid" aria-label="AI employees">
          {isLoading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="team-glass-card team-glass-skeleton" />) : (
            <>
              {visibleAgents.map((agent) => {
                const profile = profileByAgent.get(agent.id);
                return (
                  <button key={agent.id} type="button" className="team-glass-card team-agent-card" onClick={() => navigate("/team/manage")}>
                    <div className="team-avatar-wrap">
                      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="team-agent-photo" /> : <div className="team-agent-initials">{initials(agent)}</div>}
                      <span className={`team-live-dot ${agent.status === "active" ? "online" : ""}`} />
                    </div>
                    <div className="team-card-identity">
                      <strong>{agent.name}</strong>
                      <span>{agent.role}</span>
                    </div>
                    <span className={`team-card-status status-${agent.status}`}>{statusLabel(agent)}</span>
                  </button>
                );
              })}
              {Array.from({ length: emptySlots }).map((_, index) => (
                <button key={`hire-${index}`} type="button" className="team-glass-card team-hire-card" onClick={() => navigate("/team?hire=1")}>
                  <span className="team-hire-icon"><Plus aria-hidden="true" /></span>
                  <div className="team-card-identity"><strong>Hire AI Employee</strong><span>Add your next specialist</span></div>
                </button>
              ))}
            </>
          )}
        </section>

        {agents.length > 5 && (
          <div className="team-more-strip"><span>{agents.length - 5} more employees</span><Link href="/team/manage">View all</Link></div>
        )}

        {hireMode && (
          <section className="team-hire-workspace">
            <button type="button" className="team-close-hire" onClick={() => navigate("/team")}>Back to team</button>
            <AgentCreation />
          </section>
        )}
      </div>
    </div>
  );
}
