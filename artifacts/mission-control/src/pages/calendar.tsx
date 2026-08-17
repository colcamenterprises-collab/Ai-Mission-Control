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
import "./calendar-reference.css";

const CATEGORY_COLORS: Record<string, string> = { task: "bg-blue-500", content: "bg-green-500", meeting: "bg-purple-500", automation: "bg-gray-500" };
const CATEGORY_LABEL_COLORS: Record<string, string> = { task: "text-blue-400", content: "text-green-400", meeting: "text-purple-400", automation: "text-gray-400" };
type ViewMode = "month" | "week" | "day";

function formatMonthYear(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatSelectedDay(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function Calendar() {
  const queryClient = useQueryClient();
  const [today] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data: events, isLoading } = useListEvents();
  const deleteEvent = useDeleteEvent();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    return (events ?? []).filter(e => e.startDate.slice(0, 10) === dateStr);
  };

  const getDaysInMonth = (d: Date) => {
    const year = d.getFullYear();
    const month = d.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let i = 0; i < first.getDay(); i++) days.push(new Date(year, month, -i));
    days.reverse();
    for (let i = 1; i <= last.getDate(); i++) days.push(new Date(year, month, i));
    while (days.length % 7 !== 0) {
      const tail = days[days.length - 1];
      days.push(new Date(tail.getFullYear(), tail.getMonth(), tail.getDate() + 1));
    }
    return days;
  };

  const navigate = (dir: number) => setCurrentDate(d => {
    const n = new Date(d);
    if (view === "month") n.setMonth(n.getMonth() + dir);
    else if (view === "week") n.setDate(n.getDate() + dir * 7);
    else n.setDate(n.getDate() + dir);
    return n;
  });

  const days = getDaysInMonth(currentDate);
  const selectedDayEvents = getEventsForDate(selectedDate);

  return (
    <div className="mission-calendar-page workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas calendar-shell flex-1">
        <header className="calendar-hero">
          <div>
            <h1>Calendar</h1>
            <p>Plan meetings, work, marketing and follow-ups.</p>
          </div>
          <div className="calendar-actions">
            <div className="calendar-nav-group">
              <button aria-label="Previous period" onClick={() => navigate(-1)} className="calendar-nav-button"><ChevronLeft className="w-4 h-4" /></button>
              <span className="calendar-month-label">{formatMonthYear(currentDate)}</span>
              <button aria-label="Next period" onClick={() => navigate(1)} className="calendar-nav-button"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="calendar-view-toggle">
              {(["month", "week", "day"] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={view === v ? "is-active" : ""}>{v}</button>
              ))}
            </div>
            <button className="calendar-add-button" onClick={() => setShowCreate(true)}><Plus className="inline-block w-3.5 h-3.5 mr-1" />Add event</button>
          </div>
        </header>

        <section className="calendar-panel">
          <div className="calendar-legend">
            {Object.keys(CATEGORY_COLORS).map(cat => (
              <div key={cat} className="calendar-legend-item">
                <span className={`calendar-legend-dot ${CATEGORY_COLORS[cat]}`} />
                <span className="capitalize">{cat === "content" ? "marketing" : cat}</span>
              </div>
            ))}
          </div>

          <div className="calendar-board">
            <div className="calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="calendar-weekday">{d}</div>)}
            </div>

            {isLoading ? (
              <div className="calendar-loading-grid">{[...Array(35)].map((_, i) => <Skeleton key={i} />)}</div>
            ) : (
              <div className="calendar-grid">
                {days.map((date, i) => {
                  const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                  const isToday = date.toDateString() === today.toDateString();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const dayEvents = getEventsForDate(date);
                  return (
                    <button
                      type="button"
                      key={`${date.toISOString()}-${i}`}
                      className={`calendar-day ${!isCurrentMonth ? "is-outside" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setSelectedDate(date)}
                      title={dayEvents.length ? `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : undefined}
                    >
                      <span className="calendar-day-number">{date.getDate()}</span>
                      {dayEvents.length > 0 && <span className="calendar-day-count" aria-label={`${dayEvents.length} events`} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDayEvents.length ? (
            <div className="calendar-event-list" aria-label={`Events for ${formatSelectedDay(selectedDate)}`}>
              {selectedDayEvents.map(ev => (
                <button key={ev.id} className="calendar-event-card text-left" onClick={() => setSelectedEvent(ev)}>
                  <span className={`calendar-event-bar ${CATEGORY_COLORS[ev.category]}`} />
                  <span>
                    <strong>{ev.title}</strong>
                    <small>{new Date(ev.startDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {ev.category === "content" ? "marketing" : ev.category}</small>
                  </span>
                  <span className="calendar-event-count">{formatSelectedDay(selectedDate)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="calendar-empty">No scheduled activity for {formatSelectedDay(selectedDate)}.</div>
          )}
        </section>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={o => !o && setSelectedEvent(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle>{selectedEvent?.title}</DialogTitle></DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[selectedEvent.category]}`} /><span className={`capitalize ${CATEGORY_LABEL_COLORS[selectedEvent.category]}`}>{selectedEvent.category === "content" ? "marketing" : selectedEvent.category}</span></div>
              <p className="text-muted-foreground">{new Date(selectedEvent.startDate).toLocaleString()}</p>
              {selectedEvent.description && <p className="text-muted-foreground">{selectedEvent.description}</p>}
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" onClick={() => deleteEvent.mutate({ id: selectedEvent.id }, { onSuccess: () => { invalidate(); setSelectedEvent(null); } })}>Delete</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateEventDialog open={showCreate} onClose={() => setShowCreate(false)} invalidate={invalidate} />
    </div>
  );
}

function CreateEventDialog({ open, onClose, invalidate }: { open: boolean; onClose: () => void; invalidate: () => void }) {
  const createEvent = useCreateEvent();
  const [form, setForm] = useState({ title: "", description: "", category: "meeting", startDate: "", endDate: "", allDay: false });
  const handleSubmit = () => {
    if (!form.title || !form.startDate) return;
    createEvent.mutate({ data: { title: form.title, description: form.description || null, category: form.category as any, startDate: new Date(form.startDate).toISOString(), endDate: form.endDate ? new Date(form.endDate).toISOString() : null, allDay: form.allDay } }, { onSuccess: () => { invalidate(); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle>Add event</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Input placeholder="Event title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["task", "content", "meeting", "automation"].map(c => <SelectItem key={c} value={c} className="capitalize">{c === "content" ? "marketing" : c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Start</label><Input type="datetime-local" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" /></div>
            <div><label className="text-xs text-muted-foreground">End</label><Input type="datetime-local" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" /></div>
          </div>
          <div className="flex gap-2"><Button size="sm" onClick={handleSubmit} disabled={!form.title || !form.startDate}>Create</Button><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
