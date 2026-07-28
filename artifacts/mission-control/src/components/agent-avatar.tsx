import { cn } from "@/lib/utils";

const AGENT_TONES = ["violet", "cyan", "blue", "green", "rose", "amber"] as const;

export function agentTone(name?: string | null) {
  const value = (name || "unassigned").split("").reduce((total, character) => total + character.charCodeAt(0), 0);
  return AGENT_TONES[value % AGENT_TONES.length];
}

export function AgentAvatar({
  name,
  initials,
  className,
}: {
  name?: string | null;
  initials?: string | null;
  className?: string;
}) {
  const label = initials || (name || "AI").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className={cn("mission-agent-avatar", `mission-agent-${agentTone(name)}`, className)}
      aria-label={name || "Unassigned"}
      title={name || "Unassigned"}
    >
      <span className="mission-agent-face">{label}</span>
    </span>
  );
}
