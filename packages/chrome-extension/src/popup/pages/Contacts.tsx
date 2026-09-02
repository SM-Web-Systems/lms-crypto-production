import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contactsApi } from "../../shared/lib/api";
import { UserPlus, Trash2, Copy, Send, Edit2, X, Check } from "lucide-react";
import { toast } from "sonner";

export default function Contacts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", address: "", memo: "", notes: "" });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: contactsApi.list,
  });

  const addMutation = useMutation({
    mutationFn: contactsApi.add,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setShowAdd(false);
      setForm({ name: "", address: "", memo: "", notes: "" });
      toast.success(t("contacts.added", "Contact added"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => contactsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setEditId(null);
      toast.success(t("contacts.updated", "Contact updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: contactsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(t("contacts.deleted", "Contact deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success(t("common.copied", "Copied"));
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">{t("nav.contacts", "Contacts")}</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="p-1.5 rounded-lg bg-stellar-blue/20 text-stellar-blue hover:bg-stellar-blue/30"
        >
          {showAdd ? <X size={16} /> : <UserPlus size={16} />}
        </button>
      </div>

      {showAdd && (
        <div className="bg-stellar-card rounded-xl p-3 space-y-2 border border-stellar-border">
          <input
            placeholder={t("contacts.name", "Name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-stellar-bg border border-stellar-border rounded-lg px-3 py-2 text-sm text-white"
          />
          <input
            placeholder={t("contacts.address", "Stellar Address")}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full bg-stellar-bg border border-stellar-border rounded-lg px-3 py-2 text-sm text-white font-mono"
          />
          <input
            placeholder={t("contacts.memo", "Memo (optional)")}
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            className="w-full bg-stellar-bg border border-stellar-border rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            onClick={() => addMutation.mutate(form)}
            disabled={!form.name || !form.address || addMutation.isPending}
            className="w-full py-2 rounded-lg bg-stellar-blue text-white text-sm font-medium disabled:opacity-50"
          >
            {addMutation.isPending ? "..." : t("contacts.save", "Save Contact")}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-stellar-muted py-8">{t("common.loading", "Loading...")}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center text-stellar-muted py-8">{t("contacts.empty", "No contacts yet")}</div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c: any) => (
            <div key={c.id} className="bg-stellar-card rounded-xl p-3 border border-stellar-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{c.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyAddress(c.address)} className="p-1 text-stellar-muted hover:text-white">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => { setEditId(c.id); setForm({ name: c.name, address: c.address, memo: c.memo || "", notes: c.notes || "" }); }} className="p-1 text-stellar-muted hover:text-white">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteMutation.mutate(c.id)} className="p-1 text-stellar-muted hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-stellar-muted font-mono truncate">{c.address}</p>
              {c.memo && <p className="text-xs text-stellar-muted mt-1">Memo: {c.memo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
