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

const CATEGORIES = ["Internal Team", "Content Team", "External", "Clients"];

const CATEGORY_COLORS: Record<string, string> = {
  "Internal Team": "bg-primary/20 text-primary",
  "Content Team": "bg-purple-500/20 text-purple-400",
  "External": "bg-blue-500/20 text-blue-400",
  "Clients": "bg-green-500/20 text-green-400",
};

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
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">Contacts / CRM</h1>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3 mr-1" /> New Contact
        </Button>
      </div>

      <div className="p-4 border-b border-border flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search contacts..."
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
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-36 w-full" />)}
          </div>
        ) : contacts?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map(contact => (
              <div
                key={contact.id}
                className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedContact(contact)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border flex-shrink-0">
                      <span className="font-mono text-sm text-primary">{contact.name.split(" ").map(n => n[0]).join("").slice(0,2)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.role}</p>
                    </div>
                  </div>
                  <Badge className={`text-xs px-1.5 py-0 ${CATEGORY_COLORS[contact.category]}`}>{contact.category}</Badge>
                </div>
                <div className="space-y-1 mt-3">
                  {contact.handle && <p className="text-xs text-muted-foreground font-mono">{contact.handle}</p>}
                  {contact.timezone && <p className="text-xs text-muted-foreground">{contact.timezone}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No contacts found</p>
          </div>
        )}
      </div>

      {/* Contact detail */}
      <Dialog open={!!selectedContact} onOpenChange={o => !o && setSelectedContact(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedContact?.name}</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-3 text-sm">
              <Badge className={`capitalize ${CATEGORY_COLORS[selectedContact.category]}`}>{selectedContact.category}</Badge>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Role</label>
                  <p className="mt-1">{selectedContact.role}</p>
                </div>
                {selectedContact.handle && (
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase">Handle</label>
                    <p className="mt-1 font-mono text-xs">{selectedContact.handle}</p>
                  </div>
                )}
                {selectedContact.timezone && (
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase">Timezone</label>
                    <p className="mt-1">{selectedContact.timezone}</p>
                  </div>
                )}
                {selectedContact.compensation && (
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase">Compensation</label>
                    <p className="mt-1">{selectedContact.compensation}</p>
                  </div>
                )}
              </div>
              {selectedContact.notes && (
                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase">Notes</label>
                  <p className="mt-1 text-muted-foreground">{selectedContact.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="destructive" size="sm" onClick={() => {
                  deleteContact.mutate({ id: selectedContact.id }, { onSuccess: () => { invalidate(); setSelectedContact(null); } });
                }}>Delete</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedContact(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={o => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">New Contact</DialogTitle>
          </DialogHeader>
          <CreateContactForm onClose={() => setShowCreate(false)} onSave={(data) => {
            createContact.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateContactForm({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ name: "", role: "", handle: "", timezone: "", category: "External", compensation: "", notes: "" });
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input placeholder="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
      </div>
      <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
      <Input placeholder="Handle (@username)" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} />
      <Input placeholder="Timezone (e.g. EST UTC-5)" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} />
      <Input placeholder="Compensation (optional)" value={form.compensation} onChange={e => setForm(f => ({ ...f, compensation: e.target.value }))} />
      <Textarea placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave({ ...form, handle: form.handle || null, timezone: form.timezone || null, compensation: form.compensation || null, notes: form.notes || null })} disabled={!form.name || !form.role}>Save</Button>
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
