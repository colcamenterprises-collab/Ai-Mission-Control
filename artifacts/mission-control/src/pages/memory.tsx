import { useState } from "react";
import { useListMemories, useCreateMemory, useDeleteMemory, getListMemoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Memory } from "@workspace/api-client-react";
import { Search, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = ["knowledge", "processes", "decisions", "research", "archive"];

const CATEGORY_COLORS: Record<string, string> = {
  knowledge: "bg-cyan-500/20 text-cyan-400",
  processes: "bg-blue-500/20 text-blue-400",
  decisions: "bg-amber-500/20 text-amber-400",
  research: "bg-purple-500/20 text-purple-400",
  archive: "bg-muted text-muted-foreground",
};

export default function Memory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: memories, isLoading } = useListMemories({ search: search || undefined, category: category !== "all" ? category : undefined });
  const deleteMemory = useDeleteMemory();
  const createMemory = useCreateMemory();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Memory Library</h1>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3 mr-1" /> New Memory
        </Button>
      </div>

      <div className="p-4 border-b border-border flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search memories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36 w-full" />)}
          </div>
        ) : memories?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memories.map(memory => (
              <div
                key={memory.id}
                className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedMemory(memory)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-sm leading-snug flex-1 mr-2">{memory.title}</h3>
                  <Badge className={`text-xs px-1.5 py-0 capitalize flex-shrink-0 ${CATEGORY_COLORS[memory.category]}`}>
                    {memory.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{memory.preview}</p>
                <p className="text-xs text-muted-foreground/50 font-mono mt-3">
                  {new Date(memory.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No memories found</p>
            <p className="text-xs mt-1">{search ? "Try a different search term" : "Create your first memory"}</p>
          </div>
        )}
      </div>

      {/* Memory detail */}
      <Dialog open={!!selectedMemory} onOpenChange={o => !o && setSelectedMemory(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedMemory?.title}</DialogTitle>
          </DialogHeader>
          {selectedMemory && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <Badge className={`capitalize ${CATEGORY_COLORS[selectedMemory.category]}`}>{selectedMemory.category}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{new Date(selectedMemory.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="bg-background rounded-lg p-4 border border-border max-h-96 overflow-y-auto">
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedMemory.content}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => {
                  deleteMemory.mutate({ id: selectedMemory.id }, { onSuccess: () => { invalidate(); setSelectedMemory(null); } });
                }}>Delete</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedMemory(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={o => !o && setShowCreate(false)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">New Memory</DialogTitle>
          </DialogHeader>
          <CreateMemoryForm onClose={() => setShowCreate(false)} onSave={(data) => {
            createMemory.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateMemoryForm({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ title: "", content: "", category: "knowledge" });
  return (
    <div className="space-y-3 text-sm">
      <Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Textarea placeholder="Content..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.title || !form.content}>Save</Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
