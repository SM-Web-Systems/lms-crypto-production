import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiKeyApi } from "../lib/api";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  Clock,
  Shield,
} from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  key: string;
  keyPreview?: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const loadKeys = useCallback(async () => {
    try {
      const data: any = await apiKeyApi.list();
      const keysList: ApiKey[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.keys)
        ? data.keys
        : [];
      setKeys(keysList);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("token") || err.message?.includes("Token")) {
        toast.error(t("apiKeys.loginRequired", "Please log in to manage API keys"));
        return;
      }
      toast.error(err.message || t("apiKeys.loadError", "Failed to load API keys"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return toast.error(t("apiKeys.nameRequired", "Please enter a name for the key"));

    setCreating(true);
    try {
      const data = await apiKeyApi.create(name);
      setNewlyCreatedKey(data.key);
      setNewKeyName("");
      setShowCreateForm(false);
      await loadKeys();
      toast.success(t("apiKeys.created", "API key created successfully"));
    } catch (err: any) {
      toast.error(err.message || t("apiKeys.createError", "Failed to create API key"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number, name: string) => {
    const confirmed = window.confirm(
      t("apiKeys.revokeConfirm", `Are you sure you want to revoke "${name}"? This cannot be undone.`)
    );
    if (!confirmed) return;

    setRevoking(id);
    try {
      await apiKeyApi.revoke(id);
      setKeys((prev: ApiKey[]) => prev.filter((k: ApiKey) => k.id !== id));
      toast.success(t("apiKeys.revoked", "API key revoked"));
    } catch (err: any) {
      toast.error(err.message || t("apiKeys.revokeError", "Failed to revoke API key"));
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success(t("common.copied", "Copied!"));
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t("apiKeys.never", "Never");
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const maskKey = (key: string) => {
    if (!key || key.length <= 12) return key || "••••••••";
    return key.slice(0, 8) + "••••••••" + key.slice(-4);
  };

  const getKeyDisplay = (apiKey: ApiKey) => apiKey.key || apiKey.keyPreview || "";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stellar-text">
            {t("apiKeys.title", "API Keys")}
          </h1>
          <p className="text-sm text-stellar-muted mt-1">
            {t("apiKeys.description", "Create and manage API keys to access the Amma Wallet API programmatically.")}
          </p>
        </div>
        {!showCreateForm && !newlyCreatedKey && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
          >
            <Plus size={16} />
            {t("apiKeys.createNew", "Create Key")}
          </button>
        )}
      </div>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
              <Key size={20} className="text-green-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-stellar-text font-semibold">
                {t("apiKeys.keyCreated", "Your API Key Has Been Created")}
              </h3>
              <p className="text-sm text-green-300/80">
                {t("apiKeys.copyWarning", "Copy this key now. You won't be able to see the full key again after closing this banner.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 rounded-lg bg-stellar-dark border border-green-500/30 text-sm text-stellar-text font-mono break-all select-all">
              {newlyCreatedKey}
            </code>
            <button
              onClick={() => handleCopy(newlyCreatedKey)}
              className="p-3 rounded-lg border border-green-500/30 hover:bg-green-500/20 transition-colors shrink-0"
            >
              {copiedKey === newlyCreatedKey ? (
                <Check size={18} className="text-green-400" />
              ) : (
                <Copy size={18} className="text-green-300" />
              )}
            </button>
          </div>
          <button
            onClick={() => setNewlyCreatedKey(null)}
            className="text-sm text-green-300/60 hover:text-green-300 transition-colors"
          >
            {t("apiKeys.dismissBanner", "I've copied my key, dismiss this")}
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-stellar-text flex items-center gap-2">
            <Plus size={18} className="text-stellar-blue" />
            {t("apiKeys.createTitle", "Create New API Key")}
          </h2>
          <p className="text-sm text-stellar-muted">
            {t("apiKeys.createDesc", "Give your key a descriptive name so you can identify it later (e.g. 'My Trading Bot', 'Portfolio Tracker').")}
          </p>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t("apiKeys.namePlaceholder", "Key name (e.g. My Trading Bot)")}
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setNewKeyName(""); }}
              className="px-4 py-2.5 rounded-lg border border-stellar-border text-stellar-muted text-sm hover:text-stellar-text transition-colors"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              {t("apiKeys.create", "Create Key")}
            </button>
          </div>
        </form>
      )}

      {/* Keys List */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-stellar-border">
          <h2 className="text-sm font-semibold text-stellar-muted uppercase tracking-wider">
            {t("apiKeys.yourKeys", "Your API Keys")} ({(keys ?? []).length})
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-stellar-muted" />
          </div>
        ) : (keys ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-stellar-border/30 flex items-center justify-center mb-4">
              <Key size={28} className="text-stellar-muted" />
            </div>
            <p className="text-stellar-text font-medium mb-1">
              {t("apiKeys.noKeys", "No API Keys Yet")}
            </p>
            <p className="text-sm text-stellar-muted mb-4">
              {t("apiKeys.noKeysDesc", "Create your first API key to start using the Amma Wallet API.")}
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
            >
              <Plus size={16} />
              {t("apiKeys.createFirst", "Create Your First Key")}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stellar-border">
            {(keys ?? []).map((apiKey) => {
              const keyStr = getKeyDisplay(apiKey);
              return (
                <div key={apiKey.id} className="px-6 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-stellar-blue/15 flex items-center justify-center">
                        <Shield size={16} className="text-stellar-blue" />
                      </div>
                      <div>
                        <p className="text-stellar-text font-medium text-sm">{apiKey.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-stellar-muted">
                            <Clock size={10} />
                            {t("apiKeys.createdAt", "Created")}: {formatDate(apiKey.createdAt)}
                          </span>
                          {apiKey.lastUsedAt && (
                            <span className="text-xs text-stellar-muted">
                              {t("apiKeys.lastUsed", "Last used")}: {formatDate(apiKey.lastUsedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(apiKey.id, apiKey.name)}
                      disabled={revoking === apiKey.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stellar-danger/30 text-stellar-danger text-xs font-medium hover:bg-stellar-danger/10 transition-colors disabled:opacity-50"
                    >
                      {revoking === apiKey.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {t("apiKeys.revoke", "Revoke")}
                    </button>
                  </div>
                  {keyStr && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-stellar-dark border border-stellar-border text-xs text-stellar-muted font-mono">
                        {showKey[keyStr] ? keyStr : maskKey(keyStr)}
                      </code>
                      <button
                        onClick={() => setShowKey((prev) => ({ ...prev, [keyStr]: !prev[keyStr] }))}
                        className="p-2 rounded-lg border border-stellar-border hover:bg-white/5 transition-colors shrink-0"
                      >
                        {showKey[keyStr] ? (
                          <EyeOff size={14} className="text-stellar-muted" />
                        ) : (
                          <Eye size={14} className="text-stellar-muted" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCopy(keyStr)}
                        className="p-2 rounded-lg border border-stellar-border hover:bg-white/5 transition-colors shrink-0"
                      >
                        {copiedKey === keyStr ? (
                          <Check size={14} className="text-stellar-success" />
                        ) : (
                          <Copy size={14} className="text-stellar-muted" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Usage Info */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stellar-muted uppercase tracking-wider">
          {t("apiKeys.usage", "How to Use")}
        </h2>
        <div className="space-y-3">
          <p className="text-sm text-stellar-muted">
            {t("apiKeys.usageDesc", "Include your API key in the x-api-key header of your HTTP requests:")}
          </p>
          <div className="px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border">
            <code className="text-xs text-green-400 font-mono whitespace-pre">
{`curl -H "x-api-key: YOUR_API_KEY" \\
     https://ammawallet.com/api/v1/tokens`}
            </code>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              {t("apiKeys.securityNote", "Keep your API keys secret. Do not expose them in client-side code or public repositories. Rate limit: 100 requests per minute.")}
            </p>
          </div>
          <p className="text-sm text-stellar-muted">
            {t("apiKeys.docsLink", "Full API documentation is available at")}{" "}
            <a href="https://ammawallet.com/docs" target="_blank" rel="noopener noreferrer" className="text-stellar-blue hover:text-stellar-purple transition-colors">
              ammawallet.com/docs
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
