import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookUser,
  Plus,
  Search,
  Trash2,

  Copy,
  Check,
  X,
  Send,
} from "lucide-react";
import { contactsApi } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({ name: "", address: "", memo: "", memoType: "text", notes: "" });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: contactsApi.list,
  });

  const addMutation = useMutation({
    mutationFn: contactsApi.add,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setShowAdd(false);
      setForm({ name: "", address: "", memo: "", memoType: "text", notes: "" });
      toast.success(t("contacts.added", "Contact added"));
    },
    onError: (err: any) => toast.error(err.message || "Failed to add contact"),
  });


  const deleteMutation = useMutation({
    mutationFn: contactsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(t("contacts.deleted", "Contact deleted"));
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c: any) =>
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleCopy = (address: string, id: number) => {
    navigator.clipboard.writeText(address);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSend = (address: string, memo?: string) => {
    const params = new URLSearchParams({ to: address });
    if (memo) params.set("memo", memo);
    navigate("/send?" + params.toString());
  };

  const handleSubmitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim()) return;
    addMutation.mutate({
      name: form.name.trim(),
      address: form.address.trim(),
      memo: form.memo.trim() || undefined,
      memoType: form.memo.trim() ? form.memoType : undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stellar-text">{t("contacts.title", "Address Book")}</h1>
          <p className="text-sm text-stellar-muted mt-1">
            {contacts.length} {t("contacts.contactsCount", "contacts")}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd);  }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
        >
          {showAdd ? <X size={16} /> : <Plus size={16} />}
          {showAdd ? t("common.close", "Close") : t("contacts.add", "Add Contact")}
        </button>
      </div>

      {/* Add Contact Form */}
      {showAdd && (
        <form onSubmit={handleSubmitAdd} className="bg-stellar-card border border-stellar-border rounded-xl p-6 space-y-4">
          <h3 className="text-stellar-text font-medium">{t("contacts.newContact", "New Contact")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stellar-muted mb-1">{t("contacts.name", "Name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alice"
                required
                className="w-full px-3 py-2 rounded-lg bg-stellar-bg border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stellar-muted mb-1">{t("contacts.address", "Stellar Address")}</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="G..."
                required
                maxLength={56}
                className="w-full px-3 py-2 rounded-lg bg-stellar-bg border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-stellar-muted mb-1">{t("contacts.memo", "Memo (optional)")}</label>
              <input
                type="text"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="Memo text or ID"
                className="w-full px-3 py-2 rounded-lg bg-stellar-bg border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stellar-muted mb-1">{t("contacts.notes", "Notes (optional)")}</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Personal note"
                className="w-full px-3 py-2 rounded-lg bg-stellar-bg border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="px-4 py-2 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50"
          >
            {addMutation.isPending ? t("common.saving", "Saving...") : t("contacts.save", "Save Contact")}
          </button>
        </form>
      )}

      {/* Search */}
      {contacts.length > 0 && (
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("contacts.search", "Search contacts...")}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-card border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        </div>
      )}

      {/* Contact List */}
      {isLoading ? (
        <p className="text-stellar-muted text-center py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <BookUser size={48} className="mx-auto text-stellar-muted/30 mb-4" />
          <p className="text-stellar-muted">
            {contacts.length === 0
              ? t("contacts.empty", "No contacts yet. Add your first contact above.")
              : t("contacts.noResults", "No contacts match your search")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact: any) => (
            <div
              key={contact.id}
              className="bg-stellar-card border border-stellar-border rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-stellar-text text-sm">{contact.name}</p>
                  {contact.memo && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stellar-blue/20 text-stellar-blue">
                      MEMO
                    </span>
                  )}
                </div>
                <p className="text-xs text-stellar-muted font-mono truncate mt-0.5">
                  {contact.address}
                </p>
                {contact.notes && (
                  <p className="text-xs text-stellar-muted/70 mt-1 truncate">{contact.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleSend(contact.address, contact.memo)}
                  className="p-2 rounded-lg text-stellar-muted hover:text-stellar-blue hover:bg-stellar-blue/10 transition-colors"
                  title={t("contacts.sendTo", "Send to this address")}
                >
                  <Send size={16} />
                </button>
                <button
                  onClick={() => handleCopy(contact.address, contact.id)}
                  className="p-2 rounded-lg text-stellar-muted hover:text-stellar-text hover:bg-white/10 transition-colors"
                  title={t("common.copy", "Copy address")}
                >
                  {copied === contact.id ? <Check size={16} className="text-stellar-success" /> : <Copy size={16} />}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t("contacts.confirmDelete", "Delete this contact?"))) {
                      deleteMutation.mutate(contact.id);
                    }
                  }}
                  className="p-2 rounded-lg text-stellar-muted hover:text-stellar-danger hover:bg-stellar-danger/10 transition-colors"
                  title={t("contacts.delete", "Delete")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
