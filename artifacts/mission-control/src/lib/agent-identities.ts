export type AgentStatusKey = "online" | "thinking" | "waiting" | "error" | "offline";

// Place official James avatar at public/assets/james-avatar.png
export const agentIdentities = {
  james: {
    name: "James",
    avatar: "/assets/james-avatar.png",
    statuses: {
      online: { label: "Online", indicator: "🟢", colorClass: "text-emerald-500" },
      thinking: { label: "Thinking", indicator: "🔵", colorClass: "text-sky-500" },
      waiting: { label: "Waiting", indicator: "🟡", colorClass: "text-amber-500" },
      error: { label: "Error", indicator: "🔴", colorClass: "text-destructive" },
      offline: { label: "Offline", indicator: "⚪", colorClass: "text-muted-foreground" },
    },
  },
} as const;

export const jamesIdentity = agentIdentities.james;
