import { useEffect, useState } from "react";
import { useListMemories, useCreateMemory, useDeleteMemory, getListMemoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Memory } from "@workspace/api-client-react";
import { Search, Plus, RefreshCw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = ["knowledge", "processes", "decisions", "research", "archive"];
const CATEGORY_COLORS: Record<string, string> = { knowledge: "bg-cyan-500/20 text-cyan-400", processes: "bg-blue-500/20 text-blue-400", decisions: "bg-amber-500/20 text-amber-400", research: "bg-purple-500/20 text-purple-400", archive: "bg-muted text-muted-foreground" };

function authHeaders() {
  const token = localStorage.getItem("mission_control_admin_token") ?? localStorage.getItem("missionControlAdminToken");
  return { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}) };
}

export default function Memory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const { data: memories, isLoading } = useListMemories({ search: search || undefined, category: category !== "all" ? category : undefined });
  const deleteMemory = useDeleteMemory();
  const createMemory = useCreateMemory();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });

  async function syncSources(silent = false) {
    setSyncing(true);
    if (!silent) setSyncMessage("");
    try {
      const response = await fetch("/api/memories/sync", { method: "POST", headers: authHeaders() });
      const payload = await response.json().catch(() => ({})) as { scanned?: number; created?: number; updated?: number; skipped?: number; sources?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || `Memory sync failed (HTTP ${response.status})`);
      await invalidate();
      setSyncMessage(`${payload.scanned ?? 0} source documents scanned · ${payload.created ?? 0} added · ${payload.updated ?? 0} updated`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Memory sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { void syncSources(true); }, []);

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-5">
        <header className="mission-page-hero workspace-panel">
          <div><p className="workspace-eyebrow">Knowledge</p><h1 className="mission-page-title">Business knowledge.</h1><p className="mission-page-subtitle">Durable notes, processes, decisions, project documentation and Obsidian Markdown your AI team can use.</p>{syncMessage && <p className="mt-2 text-xs text-muted-foreground">{syncMessage}</p>}</div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => void syncSources()} disabled={syncing}><RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing" : "Sync sources"}</Button><Button className="mission-primary-action" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" /> Add knowledge</Button></div>
        </header>

        <div className="workspace-panel p-4 flex gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9 h-10 text-sm" placeholder="Search knowledge..." value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}</div>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-44 h-10 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading || syncing && !memories?.length ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36 w-full" />)}</div> : memories?.length ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{memories.map(memory => <div key={memory.id} className="workspace-panel p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedMemory(memory)}><div className="flex items-start justify-between mb-2"><h3 className="font-semibold text-sm leading-snug flex-1 mr-2">{memory.title}</h3><Badge className={`text-xs px-1.5 py-0 capitalize flex-shrink-0 ${CATEGORY_COLORS[memory.category] ?? "bg-muted text-muted-foreground"}`}>{memory.category}</Badge></div><p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{memory.preview}</p><p className="text-xs text-muted-foreground/50 mt-3">{new Date(memory.createdAt).toLocaleDateString()}</p></div>)}</div> : <div className="mission-empty-state"><div><p>No memory records are available</p><small>{search ? "Try a different search" : "Sync the repository / Obsidian sources above. If zero documents are scanned, the source configuration needs attention."}</small></div></div>}
        </div>
      </div>

      <Dialog open={!!selectedMemory} onOpenChange={o => !o && setSelectedMemory(null)}><DialogContent className="max-w-2xl bg-card border-border"><DialogHeader><DialogTitle>{selectedMemory?.title}</DialogTitle></DialogHeader>{selectedMemory && <div className="space-y-4 text-sm"><div className="flex items-center gap-3"><Badge className={`capitalize ${CATEGORY_COLORS[selectedMemory.category] ?? "bg-muted text-muted-foreground"}`}>{selectedMemory.category}</Badge><span className="text-xs text-muted-foreground">{new Date(selectedMemory.createdAt).toLocaleDateString()}</span></div><div className="bg-background rounded-lg p-4 border border-border max-h-96 overflow-y-auto"><p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedMemory.content}</p></div><div className="flex gap-2"><Button variant="destructive" size="sm" onClick={() => { deleteMemory.mutate({ id: selectedMemory.id }, { onSuccess: () => { invalidate(); setSelectedMemory(null); } }); }}>Delete</Button><Button size="sm" variant="outline" onClick={() => setSelectedMemory(null)}>Close</Button></div></div>}</DialogContent></Dialog>

      <Dialog open={showCreate} onOpenChange={o => !o && setShowCreate(false)}><DialogContent className="max-w-lg bg-card border-border"><DialogHeader><DialogTitle>Add knowledge</DialogTitle></DialogHeader><CreateMemoryForm onClose={() => setShowCreate(false)} onSave={(data) => { createMemory.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } }); }} /></DialogContent></Dialog>
    </div>
  );
}

function CreateMemoryForm({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ title: "", content: "", category: "knowledge" });
  return <div className="space-y-3 text-sm"><Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select><Textarea placeholder="Write the note, process or decision..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8} /><div className="flex gap-2"><Button size="sm" onClick={() => onSave(form)} disabled={!form.title || !form.content}>Save</Button><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button></div></div>;
}
