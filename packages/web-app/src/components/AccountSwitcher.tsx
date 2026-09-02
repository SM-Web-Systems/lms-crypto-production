import { useState } from "react";
import { useWalletStore } from "../store/wallet";
import type { WalletAccount } from "../store/wallet";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {ChevronDown, Plus, Download, Trash2, Pencil, Check, X, User, Copy,} from "lucide-react";

export default function AccountSwitcher() {
  const accounts = useWalletStore((s) => s.accounts);
  const activeAccountId = useWalletStore((s) => s.activeAccountId);
  const switchAccount = useWalletStore((s) => s.switchAccount);
  const removeAccount = useWalletStore((s) => s.removeAccount);
  const renameAccount = useWalletStore((s) => s.renameAccount);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const active = accounts.find((a) => a.id === activeAccountId);

  const handleSwitch = (id: string) => {
    switchAccount(id);
    setOpen(false);
  };

  const startRename = (account: WalletAccount) => {
    setEditingId(account.id);
    setEditName(account.name);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      renameAccount(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    removeAccount(id);
    setConfirmDeleteId(null);
    if (accounts.length <= 1) {
      navigate("/");
    }
  };

  const copyAddress = (e: React.MouseEvent, account: WalletAccount) => {
    e.stopPropagation();
    navigator.clipboard.writeText(account.publicKey);
    setCopiedId(account.id);
    toast.success("Address copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-stellar-blue/30 flex items-center justify-center shrink-0">
          <User size={14} className="text-stellar-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stellar-text truncate">
            {active?.name || "No Wallet"}
          </p>
          <p className="text-[10px] text-stellar-muted font-mono truncate">
            {active?.publicKey
              ? `${active.publicKey.slice(0, 6)}...${active.publicKey.slice(-6)}`
              : ""}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`text-stellar-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-stellar-card border border-stellar-border rounded-xl shadow-2xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`px-3 py-2.5 border-b border-stellar-border last:border-b-0 ${
                    account.id === activeAccountId ? "bg-stellar-blue/10" : ""
                  }`}
                >
                  {editingId === account.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 px-2 py-1 rounded bg-stellar-dark border border-stellar-border text-stellar-text text-sm focus:outline-none focus:border-stellar-blue"
                      />
                      <button onClick={saveRename} className="p-1 hover:bg-white/10 rounded">
                        <Check size={14} className="text-stellar-success" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/10 rounded">
                        <X size={14} className="text-stellar-muted" />
                      </button>
                    </div>
                  ) : confirmDeleteId === account.id ? (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-stellar-danger">Delete this wallet?</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="px-2 py-1 rounded bg-stellar-danger/20 text-stellar-danger text-xs hover:bg-stellar-danger/30"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded bg-white/5 text-stellar-muted text-xs hover:bg-white/10"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSwitch(account.id)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                            account.id === activeAccountId
                              ? "bg-stellar-blue text-white"
                              : "bg-white/10 text-stellar-muted"
                          }`}
                        >
                          {account.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-stellar-text truncate">{account.name}</p>
                          <p className="text-[10px] text-stellar-muted font-mono truncate">
                            {account.publicKey.slice(0, 8)}...{account.publicKey.slice(-6)}
                          </p>
                        </div>
                      </button>

                      {/* Actions */}
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          onClick={(e) => copyAddress(e, account)}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                          title="Copy address"
                        >
                          {copiedId === account.id ? (
                            <Check size={12} className="text-stellar-success" />
                          ) : (
                            <Copy size={12} className="text-stellar-muted" />
                          )}
                        </button>
                        <button
                          onClick={() => startRename(account)}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                          title="Rename"
                        >
                          <Pencil size={12} className="text-stellar-muted" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(account.id)}
                          className="p-1.5 rounded hover:bg-stellar-danger/20 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={12} className="text-stellar-muted" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-stellar-border p-2 space-y-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/onboarding?action=create");
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-stellar-muted hover:text-stellar-text hover:bg-white/5 transition-colors"
              >
                <Plus size={14} />
                Create New Wallet
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/onboarding?action=import");
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-stellar-muted hover:text-stellar-text hover:bg-white/5 transition-colors"
              >
                <Download size={14} />
                Import Wallet
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}