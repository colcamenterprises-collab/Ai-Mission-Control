import { useState } from "react";
import { useListContent, useCreateContent, useMoveContent, getListContentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentItem } from "@workspace/api-client-react";
import { Plus, LayoutGrid, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const STAGES = [
  { id: "idea", label: "Ideas" },
  { id: "scripting", label: "Writing" },
  { id: "recording", label: "Creating" },
  { id: "editing", label: "Editing" },
  { id: "review", label: "Check" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Live" },
] as const;
const PLATFORMS = ["YouTube", "X", "LinkedIn", "Instagram", "Newsletter", "Other"];
const PLATFORM_COLORS: Record<string, string> = { YouTube: "bg-red-500/20 text-red-400", X: "bg-slate-500/20 text-slate-300", LinkedIn: "bg-blue-500/20 text-blue-400", Instagram: "bg-pink-500/20 text-pink-400", Newsletter: "bg-purple-500/20 text-purple-400", Other: "bg-muted text-muted-foreground" };
const WEEKLY_SCHEDULE = [{ day: "Monday", theme: "Tips" }, { day: "Tuesday", theme: "Newsletter" }, { day: "Wednesday", theme: "Video" }, { day: "Thursday", theme: "Article" }, { day: "Friday", theme: "Social post" }];

export default function ContentPipeline() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "calendar">("kanban");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const { data: content, isLoading } = useListContent();
  const moveContent = useMoveContent();
  const createContent = useCreateContent();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
  const itemsByStage = (stage: string) => (content ?? []).filter(c => c.stage === stage);
  const handleDrop = (stage: string) => { if (draggedId == null) return; moveContent.mutate({ id: draggedId, data: { stage: stage as ContentItem["stage"] } }, { onSuccess: invalidate }); setDraggedId(null); };

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-5">
        <header className="mission-page-hero workspace-panel">
          <div><p className="workspace-eyebrow">Marketing</p><h1 className="mission-page-title">Marketing plan.</h1><p className="mission-page-subtitle">Plan posts, newsletters and campaign ideas in one clean board.</p></div>
          <div className="mission-topbar-actions"><Button variant="outline" onClick={() => setView("kanban")}><LayoutGrid className="w-4 h-4 mr-2" /> Board</Button><Button variant="outline" onClick={() => setView("calendar")}><CalendarDays className="w-4 h-4 mr-2" /> Week</Button><Button className="mission-primary-action" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> Add idea</Button></div>
        </header>

        <div className="flex-1 overflow-auto">
          {view === "kanban" ? isLoading ? <div className="flex gap-4">{STAGES.map(s => <div key={s.id} className="w-56 flex-shrink-0 space-y-3"><Skeleton className="h-6 w-20" /><Skeleton className="h-24 w-full" /></div>)}</div> : <div className="task-board-grid">{STAGES.map(stage => <div key={stage.id} className="task-lane workspace-panel" onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(stage.id)}><div className="task-lane-head"><div><span>{stage.label}</span></div><strong>{itemsByStage(stage.id).length}</strong></div><div className="task-lane-list">{itemsByStage(stage.id).map(item => <div key={item.id} className="task-card-minimal cursor-pointer" draggable onDragStart={() => setDraggedId(item.id)} onClick={() => setSelectedItem(item)}><p className="text-sm font-semibold leading-snug mb-2">{item.title}</p><div className="flex items-center justify-between"><Badge className={`text-xs px-1.5 py-0 ${PLATFORM_COLORS[item.platform]}`}>{item.platform}</Badge>{item.assignedDay && <span className="text-xs text-muted-foreground">{item.assignedDay.slice(0, 3)}</span>}</div></div>)}</div></div>)}</div> : <div className="space-y-4">{WEEKLY_SCHEDULE.map(({ day, theme }) => { const dayContent = (content ?? []).filter(c => c.assignedDay === day); return <div key={day} className="workspace-panel p-4"><div className="flex items-center justify-between mb-3"><strong>{day}</strong><span className="text-xs text-muted-foreground">{theme}</span></div>{dayContent.length ? <div className="flex flex-wrap gap-2">{dayContent.map(item => <button key={item.id} className="flex items-center gap-2 bg-secondary rounded-full px-3 py-1.5" onClick={() => setSelectedItem(item)}><Badge className={`text-xs px-1.5 py-0 ${PLATFORM_COLORS[item.platform]}`}>{item.platform}</Badge><span className="text-sm">{item.title}</span></button>)}</div> : <p className="text-xs text-muted-foreground">Nothing planned yet</p>}</div>; })}</div>}
        </div>
      </div>
      <Dialog open={!!selectedItem} onOpenChange={o => !o && setSelectedItem(null)}><DialogContent className="max-w-2xl bg-card border-border"><DialogHeader><DialogTitle>{selectedItem?.title}</DialogTitle></DialogHeader>{selectedItem && <div className="space-y-4 text-sm"><div className="flex items-center gap-3"><Badge className={`${PLATFORM_COLORS[selectedItem.platform]}`}>{selectedItem.platform}</Badge><span className="text-muted-foreground capitalize">{selectedItem.stage}</span>{selectedItem.assignedDay && <span className="text-muted-foreground">{selectedItem.assignedDay}</span>}</div>{selectedItem.notes && <p className="text-muted-foreground">{selectedItem.notes}</p>}<Button size="sm" variant="outline" onClick={() => setSelectedItem(null)}>Close</Button></div>}</DialogContent></Dialog>
      <CreateContentDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={(data) => createContent.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } })} />
    </div>
  );
}

function CreateContentDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (data: any) => void }) {
  const [form, setForm] = useState({ title: "", platform: "YouTube", stage: "idea", assignedDay: "", notes: "" });
  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="max-w-md bg-card border-border"><DialogHeader><DialogTitle>Add marketing idea</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><Input placeholder="Idea title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /><div className="grid grid-cols-2 gap-3"><Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select></div><Select value={form.assignedDay || "none"} onValueChange={v => setForm(f => ({ ...f, assignedDay: v === "none" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger><SelectContent><SelectItem value="none">No day</SelectItem>{["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select><Textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /><div className="flex gap-2"><Button size="sm" onClick={() => onCreate({ ...form, assignedDay: form.assignedDay || null, script: null, draftLink: null })} disabled={!form.title}>Create</Button><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button></div></div></DialogContent></Dialog>;
}
