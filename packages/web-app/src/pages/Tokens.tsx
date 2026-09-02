import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Star, Shield, List, Plus, X,
  Loader2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { tokenApi } from "../lib/api";
import { useBalances } from "../hooks/useBalances";
import TokenIcon from "../components/TokenIcon";
import { toast } from "sonner";

const PAGE_SIZE = 50;

function formatRating(v: any) {
  if (v == null) return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(1);
}

function normalizeToken(raw: any) {
  if (!raw) return raw;
  return {
    ...raw,
    image: raw.tomlImage || raw.image || "",
    isFeatured: raw.isFeatured ?? false,
  };
}

type SortField = "rating" | "name" | "volume" | "trustlines";
type SortDir = "asc" | "desc";
type TabFilter = "all" | "featured" | "trusted";

export default function TokensPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Pagination & sort state ──
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");

  // ── Add-token search state ──
  const [showAddToken, setShowAddToken] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const { data: balances } = useBalances();
  const trustedKeys = useMemo(() => {
    if (!balances) return new Set<string>();
    return new Set(balances.map((b: any) => `${b.assetCode}-${b.assetIssuer || "native"}`));
  }, [balances]);

  // ── Map sortField to backend sortBy ──
  const backendSortBy = useMemo(() => {
    // Backend sorts are always desc except name which is asc
    // We handle direction via the field choice
    return sortField;
  }, [sortField]);

  // ── Server-side paginated query ──
  const {
    data: serverData,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["tokens-list", backendSortBy, page, query, tab],
    queryFn: () =>
      tokenApi.list({
        sortBy: backendSortBy,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: query || undefined,
        verified: tab === "featured" ? true : undefined,
      }),
    placeholderData: (prev) => prev, // keep previous data while loading
    staleTime: 30_000,
  });

  const tokens = useMemo(
    () => (serverData?.tokens || []).map(normalizeToken),
    [serverData]
  );
  const pagination = serverData?.pagination || { total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false };
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  // ── Trusted tokens (from balances, client-side) ──
  const trustedTokens = useMemo(() => {
    if (!balances) return [];
    return balances.map((b: any) => ({
      assetCode: b.assetCode,
      assetIssuer: b.assetIssuer || "native",
      assetType: b.assetType,
      tomlName: b.token?.tomlName || "",
      tomlImage: b.token?.tomlImage || "",
      image: b.token?.tomlImage || "",
      domain: b.token?.domain || "",
      isVerified: b.token?.isVerified || false,
      isFeatured: false,
      ratingAverage: b.token?.ratingAverage || null,
      trustlinesFunded: null,
      balance: b.balance,
      source: "trusted",
    }));
  }, [balances]);

  // ── Display tokens ──
  const displayTokens = tab === "trusted" ? trustedTokens : tokens;

  // ── Sort header click handler ──
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
    setPage(0);
  };

  // ── Sort indicator ──
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="text-stellar-muted/30" />;
    return sortDir === "desc"
      ? <ChevronDown size={14} className="text-stellar-blue" />
      : <ChevronUp size={14} className="text-stellar-blue" />;
  };

  // ── Smart token search (Add Token panel) ──
  const handleTokenSearch = useCallback(async (searchQuery: string) => {
    setTokenSearch(searchQuery);
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await tokenApi.searchAssets(searchQuery, 20);
      setSearchResults((data.results || []).map(normalizeToken));
    } catch (err: any) {
      toast.error(err.message || "Search failed");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const getBalance = (code: string, issuer: string) => {
    if (!balances) return null;
    return balances.find(
      (b: any) => b.assetCode === code && (b.assetIssuer || "native") === (issuer || "native")
    );
  };

  // ── Search with debounce reset ──
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setPage(0);
  };

  const handleTabChange = (key: TabFilter) => {
    setTab(key);
    setPage(0);
  };

  const tabs: { key: TabFilter; icon: any; label: string }[] = [
    { key: "all", icon: List, label: t("tokens.allTokens", "All Tokens") },
    { key: "featured", icon: Star, label: t("tokens.featured", "Featured") },
    { key: "trusted", icon: Shield, label: t("tokens.trusted", "Trusted") },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stellar-text">{t("tokens.title")}</h1>
          <p className="text-sm text-stellar-muted mt-1">
            {pagination.total.toLocaleString()} {t("tokens.tokensAvailable", "tokens available")}
          </p>
        </div>
        <button
          onClick={() => setShowAddToken(!showAddToken)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
        >
          {showAddToken ? <X size={16} /> : <Plus size={16} />}
          {showAddToken ? t("common.close", "Close") : t("tokens.addToken", "Add Token")}
        </button>
      </div>

      {/* Smart Token Search (Add Token) */}
      {showAddToken && (
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-6 space-y-4">
          <h3 className="text-stellar-text font-medium">{t("tokens.findToken", "Find a Token")}</h3>
          <p className="text-xs text-stellar-muted">
            {t("tokens.findTokenDesc", "Search by asset code (e.g. USDC, BTC) or name. Results include verified assets from Stellar Expert and Horizon.")}
          </p>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
            <input
              type="text"
              value={tokenSearch}
              onChange={(e) => handleTokenSearch(e.target.value)}
              placeholder={t("tokens.searchByTicker", "Search by ticker or name (e.g. USDC, Bitcoin)...")}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-bg border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
            />
            {searching && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stellar-blue" />
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {searchResults.map((tk) => {
                const isTrusted = trustedKeys.has(`${tk.assetCode}-${tk.assetIssuer || "native"}`);
                return (
                  <button
                    key={`${tk.assetCode}-${tk.assetIssuer}`}
                    onClick={() => {
                      navigate(`/tokens/${encodeURIComponent(tk.assetCode)}/${encodeURIComponent(tk.assetIssuer || "native")}`);
                      setShowAddToken(false); setTokenSearch(""); setSearchResults([]);
                    }}
                    className="w-full flex items-center justify-between bg-stellar-bg border border-stellar-border rounded-lg px-4 py-3 hover:border-stellar-blue/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon code={tk.assetCode} image={tk.image || tk.tomlImage} size={32} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-stellar-text text-sm">{tk.assetCode}</span>
                          {tk.isVerified && <span className="text-[9px] px-1 py-0.5 rounded bg-stellar-success/20 text-stellar-success font-medium">VERIFIED</span>}
                          {isTrusted && <span className="text-[9px] px-1 py-0.5 rounded bg-stellar-blue/20 text-stellar-blue font-medium">TRUSTED</span>}
                        </div>
                        <p className="text-xs text-stellar-muted">
                          {tk.tomlName || tk.domain || ""}
                          {tk.assetIssuer && <span className="ml-1 font-mono">{tk.assetIssuer.slice(0, 8)}...{tk.assetIssuer.slice(-4)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {tk.ratingAverage != null && (
                        <div className="flex items-center gap-1">
                          <Star size={12} className="text-yellow-400" />
                          <span className="text-xs text-stellar-text">{formatRating(tk.ratingAverage)}</span>
                        </div>
                      )}
                      {tk.trustlinesFunded && <p className="text-[10px] text-stellar-muted">{Number(tk.trustlinesFunded).toLocaleString()} holders</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {tokenSearch.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-sm text-stellar-muted text-center py-4">
              {t("tokens.noAssetsFound", "No assets found for")} "{tokenSearch}"
            </p>
          )}
        </div>
      )}

      {/* Search + Tabs */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t("tokens.searchPlaceholder", "Search tokens...")}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-card border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? "bg-stellar-blue/20 text-stellar-blue border border-stellar-blue/40"
                : "bg-stellar-card border border-stellar-border text-stellar-muted hover:text-stellar-text hover:border-stellar-blue/30"
            }`}
          >
            <Icon size={16} />
            {label}
            {tab === key && tab !== "trusted" && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-stellar-blue/30 text-stellar-blue">
                {pagination.total.toLocaleString()}
              </span>
            )}
            {tab === key && tab === "trusted" && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-stellar-blue/30 text-stellar-blue">
                {trustedTokens.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-stellar-danger/10 border border-stellar-danger/30 rounded-lg p-4">
          <p className="text-sm text-stellar-danger">
            {t("tokens.failedToLoad", { error: (error as Error).message })}
          </p>
        </div>
      )}

      {/* Sortable Table Header */}
      {tab !== "trusted" && (
        <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs text-stellar-muted uppercase tracking-wider">
          <div className="col-span-5">
            <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-stellar-text transition-colors">
              {t("tokens.name", "Token")} <SortIcon field="name" />
            </button>
          </div>
          <div className="col-span-2 text-right">
            <button onClick={() => handleSort("rating")} className="flex items-center gap-1 ml-auto hover:text-stellar-text transition-colors">
              {t("tokens.trustScore", "Trust Score")} <SortIcon field="rating" />
            </button>
          </div>
          <div className="col-span-3 text-right">
            <button onClick={() => handleSort("volume")} className="flex items-center gap-1 ml-auto hover:text-stellar-text transition-colors">
              {t("tokens.volume", "Volume 7d")} <SortIcon field="volume" />
            </button>
          </div>
          <div className="col-span-2 text-right">
            <button onClick={() => handleSort("trustlines")} className="flex items-center gap-1 ml-auto hover:text-stellar-text transition-colors">
              {t("tokens.holders", "Holders")} <SortIcon field="trustlines" />
            </button>
          </div>
        </div>
      )}

      {/* Token List */}
      {isLoading && !serverData ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-stellar-muted" size={32} />
        </div>
      ) : displayTokens.length === 0 && !error ? (
        <p className="text-stellar-muted text-center py-12">
          {query ? t("tokens.noSearchResults", { query }) : t("tokens.noFeatured", "No tokens found")}
        </p>
      ) : (
        <div className={`space-y-1 ${isFetching ? "opacity-60" : ""} transition-opacity`}>
          {displayTokens.map((tk) => {
            const isTrusted = trustedKeys.has(`${tk.assetCode}-${tk.assetIssuer || "native"}`);
            const bal = getBalance(tk.assetCode, tk.assetIssuer);
            return (
              <Link
                key={`${tk.assetCode}-${tk.assetIssuer}`}
                to={`/tokens/${encodeURIComponent(tk.assetCode)}/${encodeURIComponent(tk.assetIssuer || "native")}`}
                className={`grid grid-cols-12 gap-2 items-center bg-stellar-card border rounded-xl px-5 py-3 hover:border-stellar-blue/50 transition-colors ${
                  isTrusted ? "border-stellar-blue/30" : "border-stellar-border"
                }`}
              >
                {/* Token info */}
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <TokenIcon code={tk.assetCode} image={tk.image || tk.tomlImage} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-stellar-text text-sm truncate">{tk.assetCode}</p>
                      {tk.isVerified && <span className="text-[9px] px-1 py-0.5 rounded bg-stellar-success/20 text-stellar-success font-medium shrink-0">VERIFIED</span>}
                      {isTrusted && <span className="text-[9px] px-1 py-0.5 rounded bg-stellar-blue/20 text-stellar-blue font-medium shrink-0">TRUSTED</span>}
                    </div>
                    <p className="text-xs text-stellar-muted truncate">{tk.tomlName || tk.homeDomain || tk.domain || ""}</p>
                  </div>
                </div>
                {/* Trust score */}
                <div className="col-span-2 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Star size={12} className="text-yellow-400" />
                    <span className="text-sm text-stellar-text">{formatRating(tk.ratingAverage)}</span>
                  </div>
                </div>
                {/* Volume */}
                <div className="col-span-3 text-right">
                  {bal ? (
                    <p className="text-sm font-mono text-stellar-text">
                      {parseFloat(bal.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-stellar-muted text-xs">{tk.assetCode}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-stellar-muted font-mono">
                      {tk.volume7d ? Number(tk.volume7d).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                    </p>
                  )}
                </div>
                {/* Holders */}
                <div className="col-span-2 text-right">
                  <p className="text-sm text-stellar-muted">
                    {tk.trustlineCount || tk.trustlinesFunded
                      ? Number(tk.trustlineCount || tk.trustlinesFunded).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {tab !== "trusted" && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-stellar-muted">
            {t("common.showing", "Showing")} {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, pagination.total).toLocaleString()} {t("common.of", "of")} {pagination.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg bg-stellar-card border border-stellar-border text-stellar-muted hover:text-stellar-text hover:border-stellar-blue/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    pageNum === page
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-card border border-stellar-border text-stellar-muted hover:text-stellar-text hover:border-stellar-blue/30"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={!pagination.hasMore}
              className="p-2 rounded-lg bg-stellar-card border border-stellar-border text-stellar-muted hover:text-stellar-text hover:border-stellar-blue/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Trusted tab showing count */}
      {tab === "trusted" && (
        <p className="text-xs text-stellar-muted text-center">
          {trustedTokens.length} {t("tokens.trustedAssets", "trusted assets in your wallet")}
        </p>
      )}
    </div>
  );
}
