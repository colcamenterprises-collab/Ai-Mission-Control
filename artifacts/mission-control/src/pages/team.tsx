import { useState } from "react";
import { useListAgents, useUpdateAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Agent } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const STATUS_DOT: Record<string, string> = {
  active: "bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]",
  pending: "bg-yellow-500",
  error: "bg-red-500",
  idle: "bg-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  active: "text-primary",
  pending: "text-yellow-400",
  error: "text-red-400",
  idle: "text-muted-foreground",
};

const DEPARTMENTS = ["Developers", "Writers", "Researchers", "Operators"];

function AgentAvatar({ initials, isLead, status }: { initials: string; isLead?: boolean; status: string }) {
  return (
    <div className={`relative flex-shrink-0 ${isLead ? "w-16 h-16" : "w-10 h-10"} rounded-full bg-primary/20 border-2 ${isLead ? "border-primary" : "border-border"} flex items-center justify-center`}>
      <span className={`font-mono font-bold ${isLead ? "text-base" : "text-xs"} text-primary`}>{initials}</span>
      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background ${STATUS_DOT[status]}`} />
    </div>
  );
}

export default function Team() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const { data: agents, isLoading } = useListAgents();

  const leadAgent = agents?.find(a => a.isLead);
  const subAgents = agents?.filter(a => !a.isLead) ?? [];

  const byDepartment = (dept: string) => subAgents.filter(a => a.department === dept);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">AI Team</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full max-w-sm" />
            {DEPARTMENTS.map(d => (
              <div key={d} className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1,2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Lead Agent */}
            {leadAgent && (
              <div className="flex flex-col items-center">
                <div
                  className="bg-card border border-primary/30 rounded-xl p-6 w-80 cursor-pointer hover:border-primary/60 transition-colors text-center"
                  onClick={() => setSelectedAgent(leadAgent)}
                >
                  <div className="flex justify-center mb-3">
                    <AgentAvatar initials={leadAgent.avatarInitials} isLead status={leadAgent.status} />
                  </div>
                  <h2 className="font-mono font-bold text-lg text-primary">{leadAgent.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{leadAgent.role}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[leadAgent.status]}`} />
                    <span className={`text-xs font-mono capitalize ${STATUS_LABEL[leadAgent.status]}`}>{leadAgent.status}</span>
                  </div>
                  {leadAgent.currentTask && (
                    <p className="text-xs text-muted-foreground mt-2 font-mono">{leadAgent.currentTask}</p>
                  )}
                </div>
                {/* Connector */}
                <div className="w-px h-8 bg-border" />
              </div>
            )}

            {/* Sub-agents by department */}
            {DEPARTMENTS.map(dept => {
              const deptAgents = byDepartment(dept);
              if (!deptAgents.length) return null;
              return (
                <div key={dept}>
                  <h3 className="font-mono text-xs uppercase text-muted-foreground mb-3 flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span>{dept}</span>
                    <div className="flex-1 h-px bg-border" />
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {deptAgents.map(agent => (
                      <div
                        key={agent.id}
                        className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => setSelectedAgent(agent)}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <AgentAvatar initials={agent.avatarInitials} status={agent.status} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{agent.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                          </div>
                        </div>
                        {agent.currentTask ? (
                          <p className="text-xs text-muted-foreground font-mono truncate">{agent.currentTask}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 font-mono">Idle</p>
                        )}
                        <p className="text-xs text-muted-foreground/50 font-mono mt-2">{agent.lastActive}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Agent Detail */}
      <Dialog open={!!selectedAgent} onOpenChange={o => !o && setSelectedAgent(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-3">
              <AgentAvatar initials={selectedAgent?.avatarInitials ?? ""} status={selectedAgent?.status ?? "idle"} isLead={selectedAgent?.isLead} />
              <div>
                <div>{selectedAgent?.name}</div>
                <div className="text-sm font-normal text-muted-foreground">{selectedAgent?.role}</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Department</label>
                  <p className="mt-1">{selectedAgent.department}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Status</label>
                  <p className={`mt-1 capitalize font-mono ${STATUS_LABEL[selectedAgent.status]}`}>{selectedAgent.status}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Tasks Completed</label>
                  <p className="mt-1 font-mono">{selectedAgent.tasksCompleted}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Last Active</label>
                  <p className="mt-1 font-mono text-xs">{selectedAgent.lastActive}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-mono uppercase">Success Rate</label>
                <div className="flex items-center gap-3 mt-2">
                  <Progress value={selectedAgent.successRate} className="flex-1 h-2" />
                  <span className="text-xs font-mono text-primary">{selectedAgent.successRate}%</span>
                </div>
              </div>
              {selectedAgent.currentTask && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Current Task</label>
                  <p className="mt-1 text-muted-foreground">{selectedAgent.currentTask}</p>
                </div>
              )}
              {selectedAgent.responsibilities && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Responsibilities</label>
                  <p className="mt-1 text-muted-foreground leading-relaxed">{selectedAgent.responsibilities}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
