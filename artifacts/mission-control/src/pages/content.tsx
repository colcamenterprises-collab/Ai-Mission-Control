import { useState } from "react";
import { useListContent, useCreateContent, useUpdateContent, useDeleteContent, useMoveContent, getListContentQueryKey } from "@workspace/api-client-react";
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
  { id: "idea", label: "Idea" },
  { id: "scripting", label: "Scripting" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
  { id: "review", label: "Review" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
] as const;

const PLATFORMS = ["YouTube", "X", "LinkedIn", "Instagram", "Newsletter", "Other"];

const PLATFORM_COLORS: Record<string, string> = {
  YouTube: "bg-red-500/20 text-red-400",
  X: "bg-slate-500/20 text-slate-300",
  LinkedIn: "bg-blue-500/20 text-blue-400",
  Instagram: "bg-pink-500/20 text-pink-400",
  Newsletter: "bg-purple-500/20 text-purple-400",
  Other: "bg-muted text-muted-foreground",
};

const WEEKLY_SCHEDULE = [
  { day: "Monday", theme: "Educational Deep Dive" },
  { day: "Tuesday", theme: "Newsletter + Quick Tips" },
  { day: "Wednesday", theme: "YouTube Video" },
  { day: "Thursday", theme: "LinkedIn Article" },
  { day: "Friday", theme: "X Thread" },
];

export default function ContentPipeline() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"kanban" | "calendar">("kanban");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const { data: content, isLoading } = useListContent();
  const moveContent = useMoveContent();
  const createContent = useCreateContent();
  const deleteContent = useDeleteContent();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });

  const itemsByStage = (stage: string) => (content ?? []).filter(c => c.stage === stage);

  const handleDrop = (stage: string) => {
    if (draggedId == null) return;
    moveContent.mutate({ id: draggedId, data: { stage: stage as ContentItem["stage"] } }, { onSuccess: invalidate });
    setDraggedId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Content Pipeline</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-secondary rounded overflow-hidden border border-border">
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="w-3 h-3" /> Kanban
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 ${view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <CalendarDays className="w-3 h-3" /> Weekly
            </button>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="w-3 h-3 mr-1" /> New Content
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {view === "kanban" ? (
          isLoading ? (
            <div className="flex gap-4">
              {STAGES.map(s => (
                <div key={s.id} className="w-56 flex-shrink-0 space-y-3">
                  <Skeleton className="h-6 w-20" />
                  {[1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 h-full min-h-0">
              {STAGES.map(stage => (
                <div
                  key={stage.id}
                  className="w-52 flex-shrink-0 flex flex-col bg-card/50 rounded-lg border border-border"
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(stage.id)}
                >
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <span className="font-mono text-xs uppercase text-muted-foreground">{stage.label}</span>
                    <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{itemsByStage(stage.id).length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {itemsByStage(stage.id).map(item => (
                      <div
                        key={item.id}
                        className="bg-card border border-border rounded p-3 cursor-pointer hover:border-primary/50 transition-colors"
                        draggable
                        onDragStart={() => setDraggedId(item.id)}
                        onClick={() => setSelectedItem(item)}
                      >
                        <p className="text-sm font-medium leading-snug mb-2">{item.title}</p>
                        <div className="flex items-center justify-between">
                          <Badge className={`text-xs px-1.5 py-0 ${PLATFORM_COLORS[item.platform]}`}>{item.platform}</Badge>
                          {item.assignedDay && <span className="text-xs text-muted-foreground font-mono">{item.assignedDay.slice(0, 3)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <h2 className="font-mono text-sm uppercase text-muted-foreground">Weekly Posting Schedule</h2>
            <div className="grid gap-3">
              {WEEKLY_SCHEDULE.map(({ day, theme }) => {
                const dayContent = (content ?? []).filter(c => c.assignedDay === day);
                return (
                  <div key={day} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-mono font-semibold">{day}</span>
                        <span className="ml-3 text-xs text-muted-foreground">{theme}</span>
                      </div>
                    </div>
                    {dayContent.length ? (
                      <div className="flex flex-wrap gap-2">
                        {dayContent.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 bg-secondary rounded px-3 py-1.5 cursor-pointer hover:border-primary/50 border border-transparent"
                            onClick={() => setSelectedItem(item)}
                          >
                            <Badge className={`text-xs px-1.5 py-0 ${PLATFORM_COLORS[item.platform]}`}>{item.platform}</Badge>
                            <span className="text-sm">{item.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No content scheduled</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Content Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={o => !o && setSelectedItem(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedItem?.title}</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <Badge className={`${PLATFORM_COLORS[selectedItem.platform]}`}>{selectedItem.platform}</Badge>
                <span className="text-muted-foreground font-mono capitalize">{selectedItem.stage}</span>
                {selectedItem.assignedDay && <span className="text-muted-foreground">Day: {selectedItem.assignedDay}</span>}
              </div>
              {selectedItem.script && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Script / Content</label>
                  <div className="mt-2 bg-background rounded p-3 text-sm text-foreground/80 font-mono whitespace-pre-wrap border border-border max-h-48 overflow-y-auto">
                    {selectedItem.script}
                  </div>
                </div>
              )}
              {selectedItem.draftLink && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Draft Link</label>
                  <a href={selectedItem.draftLink} target="_blank" rel="noopener noreferrer" className="mt-1 block text-primary hover:underline font-mono text-xs">
                    {selectedItem.draftLink}
                  </a>
                </div>
              )}
              {selectedItem.notes && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Notes</label>
                  <p className="mt-1 text-muted-foreground">{selectedItem.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" onClick={() => {
                  deleteContent.mutate({ id: selectedItem.id }, { onSuccess: () => { invalidate(); setSelectedItem(null); } });
                }}>Delete</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedItem(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <CreateContentDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={(data) => {
        createContent.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
      }} />
    </div>
  );
}

function CreateContentDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (data: any) => void }) {
  const [form, setForm] = useState({ title: "", platform: "YouTube", stage: "idea", assignedDay: "", script: "", draftLink: "", notes: "" });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono">New Content</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={form.assignedDay || "none"} onValueChange={v => setForm(f => ({ ...f, assignedDay: v === "none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="Assigned day" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No day</SelectItem>
              {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea placeholder="Script / notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onCreate({ ...form, assignedDay: form.assignedDay || null, script: null, draftLink: null })} disabled={!form.title}>Create</Button>
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
