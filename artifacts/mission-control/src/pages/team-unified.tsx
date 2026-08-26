import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Plus, Settings2, Sparkles } from "lucide-react";
import { getListAgentsQueryKey, useListAgents, type Agent } from "@workspace/api-client-react";
import AgentCreation from "@/pages/agent-creation";
import AgentProfilePanel from "@/pages/agent-profile-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function description(agent: Agent) {
  const source = agent.responsibilities?.trim() || `${agent.role} supporting the ${agent.department} function.`;
  const sentence = source.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || source;
  return sentence.length > 140 ? `${sentence.slice(0, 137).trimEnd()}…` : sentence;
}

function AgentModal({ agent, mode, onClose, onChanged }: { agent: Agent | null; mode: "manage" | "chat"; onClose: () => void; onChanged: () => void }) {
  if (!agent) return null;
  return (
    <Dialog open={Boolean(agent)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="team-agent-modal">
        <DialogHeader>
          <DialogTitle className="team-modal-title">
            <span className={`team-modal-live-dot status-${agent.status}`} />
            <span><strong>{agent.name}</strong><em>{statusLabel(agent)} · {agent.role}</em></span>
          </DialogTitle>
        </DialogHeader>
        <AgentProfilePanel agent={agent} initialMode={mode} onChanged={onChanged} />
      </DialogContent>
    </Dialog>
  );
}

export default function TeamUnified() {
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useListAgents();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<"manage" | "chat">("manage");
  const initialHireMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hire") === "1";
  const [hireOpen, setHireOpen] = useState(initialHireMode);

  useEffect(() => {
    fetch("/api/employee-factory/profiles", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setProfiles(Array.isArray(rows) ? rows : []))
      .catch(() => setProfiles([]));
  }, [agents.length]);

  const profileByAgent = useMemo(() => new Map(profiles.map((profile) => [profile.agentId, profile])), [profiles]);
  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) ?? null : null;
  const refreshAgents = () => { void queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() }); };

  const openAgent = (agentId: number, mode: "manage" | "chat") => {
    setSelectedAgentId(agentId);
    setModalMode(mode);
  };

  const closeHire = () => {
    setHireOpen(false);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("hire")) window.history.replaceState({}, "", "/team");
  };

  return (
    <div className="team-unified-shell">
      <div className="team-unified-canvas">
        <header className="team-unified-header">
          <div>
            <span className="team-unified-eyebrow"><Sparkles aria-hidden="true" /> AI Team</span>
            <h1>Your AI employees</h1>
            <p className="team-unified-subtitle">Your active AI workforce, their responsibilities, status and direct controls.</p>
          </div>
        </header>

        <section className="team-employee-grid" aria-label="AI employees">
          {isLoading ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="team-glass-card team-glass-skeleton" />) : (
            <>
              {agents.map((agent) => {
                const profile = profileByAgent.get(agent.id);
                return (
                  <article key={agent.id} className="team-glass-card team-agent-card">
                    <div className="team-avatar-wrap">
                      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="team-agent-photo" /> : <div className="team-agent-initials">{initials(agent)}</div>}
                      <span className={`team-live-dot ${agent.status === "active" ? "online" : ""}`} />
                    </div>
                    <div className="team-card-identity">
                      <strong>{agent.name}</strong>
                      <span className="team-card-role">{agent.role}</span>
                      <p>{description(agent)}</p>
                    </div>
                    <span className={`team-card-status status-${agent.status}`}>{statusLabel(agent)}</span>
                    <div className="team-card-actions">
                      <button type="button" onClick={() => openAgent(agent.id, "manage")}><Settings2 aria-hidden="true" /> Manage</button>
                      <button type="button" onClick={() => openAgent(agent.id, "chat")}><MessageCircle aria-hidden="true" /> Chat</button>
                    </div>
                  </article>
                );
              })}

              <button type="button" className="team-glass-card team-hire-card" onClick={() => setHireOpen(true)}>
                <span className="team-hire-icon"><Plus aria-hidden="true" /></span>
                <div className="team-card-identity">
                  <strong>Hire AI Employee</strong>
                  <p>Add another specialist to your workforce and connect their runtime, project and approved AI account.</p>
                </div>
              </button>
            </>
          )}
        </section>
      </div>

      <AgentModal agent={selectedAgent} mode={modalMode} onClose={() => setSelectedAgentId(null)} onChanged={refreshAgents} />

      <Dialog open={hireOpen} onOpenChange={(open) => !open && closeHire()}>
        <DialogContent className="team-hire-dialog">
          <DialogHeader><DialogTitle><span className="team-unified-eyebrow"><Bot className="h-4 w-4" /> Hire AI Employee</span></DialogTitle></DialogHeader>
          <div className="team-hire-dialog-body"><AgentCreation /></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
