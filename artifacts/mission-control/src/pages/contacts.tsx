import { useState } from "react";
import { useListContacts, useCreateContact, useDeleteContact, getListContactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Contact } from "@workspace/api-client-react";
import { Search, Plus, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = ["Team", "Customers", "Partners", "Suppliers"];
const CATEGORY_COLORS: Record<string, string> = { Team: "bg-primary/20 text-primary", Customers: "bg-green-500/20 text-green-400", Partners: "bg-purple-500/20 text-purple-400", Suppliers: "bg-blue-500/20 text-blue-400", External: "bg-blue-500/20 text-blue-400", Clients: "bg-green-500/20 text-green-400", "Internal Team": "bg-primary/20 text-primary", "Content Team": "bg-purple-500/20 text-purple-400" };

export default function Contacts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data: contacts, isLoading } = useListContacts({ search: search || undefined, category: category !== "all" ? category : undefined });
  const deleteContact = useDeleteContact();
  const createContact = useCreateContact();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });

  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <div className="workspaces-canvas flex-1 space-y-5">
        <header className="mission-page-hero workspace-panel">
          <div><p className="workspace-eyebrow">People</p><h1 className="mission-page-title">People and customers.</h1><p className="mission-page-subtitle">Keep the important people connected to your business in one place.</p></div>
          <Button className="mission-primary-action" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> Add person</Button>
        </header>

        <div className="workspace-panel p-4 flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9 h-10 text-sm" placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}</div><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-44 h-10 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All people</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>

        <div className="flex-1 overflow-y-auto">{isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-36 w-full" />)}</div> : contacts?.length ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{contacts.map(contact => <div key={contact.id} className="workspace-panel p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedContact(contact)}><div className="flex items-start justify-between mb-2"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border flex-shrink-0"><span className="text-sm text-primary font-semibold">{contact.name.split(" ").map(n => n[0]).join("").slice(0,2)}</span></div><div><p className="font-semibold text-sm">{contact.name}</p><p className="text-xs text-muted-foreground">{contact.role}</p></div></div><Badge className={`text-xs px-1.5 py-0 ${CATEGORY_COLORS[contact.category] ?? CATEGORY_COLORS.Partners}`}>{contact.category}</Badge></div><div className="space-y-1 mt-3">{contact.handle && <p className="text-xs text-muted-foreground">{contact.handle}</p>}{contact.timezone && <p className="text-xs text-muted-foreground">{contact.timezone}</p>}</div></div>)}</div> : <div className="mission-empty-state"><p>No people added yet.</p></div>}</div>
      </div>

      <Dialog open={!!selectedContact} onOpenChange={o => !o && setSelectedContact(null)}><DialogContent className="max-w-md bg-card border-border"><DialogHeader><DialogTitle>{selectedContact?.name}</DialogTitle></DialogHeader>{selectedContact && <div className="space-y-3 text-sm"><Badge className={`capitalize ${CATEGORY_COLORS[selectedContact.category] ?? CATEGORY_COLORS.Partners}`}>{selectedContact.category}</Badge><p>{selectedContact.role}</p>{selectedContact.handle && <p className="text-muted-foreground">{selectedContact.handle}</p>}{selectedContact.notes && <p className="text-muted-foreground">{selectedContact.notes}</p>}<div className="flex gap-2 pt-2"><Button variant="destructive" size="sm" onClick={() => deleteContact.mutate({ id: selectedContact.id }, { onSuccess: () => { invalidate(); setSelectedContact(null); } })}>Delete</Button><Button size="sm" variant="outline" onClick={() => setSelectedContact(null)}>Close</Button></div></div>}</DialogContent></Dialog>
      <Dialog open={showCreate} onOpenChange={o => !o && setShowCreate(false)}><DialogContent className="max-w-md bg-card border-border"><DialogHeader><DialogTitle>Add person</DialogTitle></DialogHeader><CreateContactForm onClose={() => setShowCreate(false)} onSave={(data) => createContact.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } })} /></DialogContent></Dialog>
    </div>
  );
}

function CreateContactForm({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ name: "", role: "", handle: "", timezone: "", category: "Customers", compensation: "", notes: "" });
  return <div className="space-y-3 text-sm"><div className="grid grid-cols-2 gap-3"><Input placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /><Input placeholder="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} /></div><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Input placeholder="Email, phone or handle" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} /><Input placeholder="Timezone" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} /><Textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /><div className="flex gap-2"><Button size="sm" onClick={() => onSave({ ...form, handle: form.handle || null, timezone: form.timezone || null, compensation: form.compensation || null, notes: form.notes || null })} disabled={!form.name || !form.role}>Save</Button><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button></div></div>;
}
