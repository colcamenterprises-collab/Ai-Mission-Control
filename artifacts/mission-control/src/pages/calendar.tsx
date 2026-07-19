import { useState } from "react";
import { useListEvents, useCreateEvent, useDeleteEvent, getListEventsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarEvent } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_COLORS: Record<string, string> = { task: "bg-blue-500", content: "bg-green-500", meeting: "bg-purple-500", automation: "bg-gray-500" };
const CATEGORY_LABEL_COLORS: Record<string, string> = { task: "text-blue-400", content: "text-green-400", meeting: "text-purple-400", automation: "text-gray-400" };
type ViewMode = "month" | "week" | "day";
function formatMonthYear(d: Date) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }

export default function Calendar() {
  const queryClient = useQueryClient();
  const [today] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data: events, isLoading } = useListEvents();
  const deleteEvent = useDeleteEvent();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
  const getEventsForDate = (date: Date) => { const dateStr = date.toISOString().slice(0, 10); return (events ?? []).filter(e => e.startDate.slice(0, 10) === dateStr); };
  const getDaysInMonth = (d: Date) => { const year = d.getFullYear(); const month = d.getMonth(); const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0); const days: Date[] = []; for (let i = 0; i < first.getDay(); i++) days.push(new Date(year, month, -i)); days.reverse(); for (let i = 1; i <= last.getDate(); i++) days.push(new Date(year, month, i)); return days; };
  const navigate = (dir: number) => setCurrentDate(d => { const n = new Date(d); if (view === "month") n.setMonth(n.getMonth() + dir); else if (view === "week") n.setDate(n.getDate() + dir * 7); else n.setDate(n.getDate() + dir); return n; });
  const days = getDaysInMonth(currentDate);

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-5">
        <header className="mission-page-hero workspace-panel">
          <div><p className="workspace-eyebrow">Planner</p><h1 className="mission-page-title">Schedule.</h1><p className="mission-page-subtitle">Plan meetings, work, marketing and follow-ups.</p></div>
          <div className="mission-topbar-actions"><button onClick={() => navigate(-1)} className="mission-secondary-action px-3 py-2"><ChevronLeft className="w-4 h-4" /></button><span className="text-sm text-muted-foreground w-40 text-center">{formatMonthYear(currentDate)}</span><button onClick={() => navigate(1)} className="mission-secondary-action px-3 py-2"><ChevronRight className="w-4 h-4" /></button><div className="flex bg-secondary rounded-full overflow-hidden border border-border">{(["month", "week", "day"] as ViewMode[]).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-2 text-xs capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{v}</button>)}</div><Button className="mission-primary-action" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> Add event</Button></div>
        </header>

        <div className="workspace-panel p-4 flex-1 overflow-auto">
          <div className="flex gap-4 mb-4">{Object.entries(CATEGORY_LABEL_COLORS).map(([cat, color]) => <div key={cat} className="flex items-center gap-1.5 text-xs"><div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat]}`} /><span className={`${color} capitalize`}>{cat === "content" ? "marketing" : cat}</span></div>)}</div>
          {isLoading ? <div className="grid grid-cols-7 gap-1">{[...Array(35)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div> : <div className="grid grid-cols-7 gap-1">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="text-center text-xs text-muted-foreground py-2">{d}</div>)}{days.map((date, i) => { const isCurrentMonth = date.getMonth() === currentDate.getMonth(); const isToday = date.toDateString() === today.toDateString(); const dayEvents = getEventsForDate(date); return <div key={i} className={`min-h-24 rounded-xl border p-2 ${isCurrentMonth ? "border-border bg-card/30" : "border-border/30 bg-transparent opacity-40"} ${isToday ? "border-primary/60" : ""}`}><span className={`text-xs ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{date.getDate()}</span><div className="mt-1 space-y-1">{dayEvents.slice(0, 3).map(ev => <button key={ev.id} className={`block w-full text-left text-xs px-2 py-1 rounded truncate ${CATEGORY_COLORS[ev.category]} bg-opacity-20 ${CATEGORY_LABEL_COLORS[ev.category]}`} onClick={() => setSelectedEvent(ev)}>{ev.title}</button>)}{dayEvents.length > 3 && <div className="text-xs text-muted-foreground">+{dayEvents.length - 3} more</div>}</div></div>; })}</div>}
        </div>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={o => !o && setSelectedEvent(null)}><DialogContent className="max-w-md bg-card border-border"><DialogHeader><DialogTitle>{selectedEvent?.title}</DialogTitle></DialogHeader>{selectedEvent && <div className="space-y-3 text-sm"><div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[selectedEvent.category]}`} /><span className={`capitalize ${CATEGORY_LABEL_COLORS[selectedEvent.category]}`}>{selectedEvent.category}</span></div><p className="text-muted-foreground">{new Date(selectedEvent.startDate).toLocaleString()}</p>{selectedEvent.description && <p className="text-muted-foreground">{selectedEvent.description}</p>}<div className="flex gap-2 pt-2"><Button variant="destructive" size="sm" onClick={() => deleteEvent.mutate({ id: selectedEvent.id }, { onSuccess: () => { invalidate(); setSelectedEvent(null); } })}>Delete</Button><Button size="sm" variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button></div></div>}</DialogContent></Dialog>
      <CreateEventDialog open={showCreate} onClose={() => setShowCreate(false)} invalidate={invalidate} />
    </div>
  );
}

function CreateEventDialog({ open, onClose, invalidate }: { open: boolean; onClose: () => void; invalidate: () => void }) {
  const createEvent = useCreateEvent();
  const [form, setForm] = useState({ title: "", description: "", category: "meeting", startDate: "", endDate: "", allDay: false });
  const handleSubmit = () => { if (!form.title || !form.startDate) return; createEvent.mutate({ data: { title: form.title, description: form.description || null, category: form.category as any, startDate: new Date(form.startDate).toISOString(), endDate: form.endDate ? new Date(form.endDate).toISOString() : null, allDay: form.allDay } }, { onSuccess: () => { invalidate(); onClose(); } }); };
  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="max-w-md bg-card border-border"><DialogHeader><DialogTitle>Add event</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><Input placeholder="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /><Input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["task","content","meeting","automation"].map(c => <SelectItem key={c} value={c} className="capitalize">{c === "content" ? "marketing" : c}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-muted-foreground">Start</label><Input type="datetime-local" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" /></div><div><label className="text-xs text-muted-foreground">End</label><Input type="datetime-local" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" /></div></div><div className="flex gap-2"><Button size="sm" onClick={handleSubmit} disabled={!form.title || !form.startDate}>Create</Button><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button></div></div></DialogContent></Dialog>;
}
