import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../../shared/lib/api";
import TokenIcon from "../../shared/components/TokenIcon";
import { Search, Loader2, Star, Globe, List } from "lucide-react";
import { Link } from "react-router-dom";

const API_BASE = "https://ammawallet.com";

async function fetchDirectory(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/v1/tokens/directory?order=desc&limit=200`);
  if (!res.ok) return [];
  const data = await res.json();
  const records = data._embedded?.records || [];

  return records.map((r: any) => {
    const raw = r.asset || "";
    const firstDash = raw.indexOf("-");
    const lastDash = raw.lastIndexOf("-");
    const code = firstDash > 0 ? raw.substring(0, firstDash) : raw;
    const issuer =
      firstDash > 0 && lastDash > firstDash
        ? raw.substring(firstDash + 1, lastDash)
        : firstDash > 0
        ? raw.substring(firstDash + 1)
        : "native";

    return {
      assetCode: code,
      assetIssuer: issuer,
      assetType: issuer === "native" ? "native" : "credit_alphanum4",
      tomlName: r.tomlInfo?.name || r.tomlInfo?.orgName || "",
      tomlImage: r.tomlInfo?.image || "",
      homeDomain: r.domain || "",
      isVerified: (r.rating?.average ?? 0) >= 6,
      isFeatured: false,
      ratingAverage: r.rating?.average ?? null,
      trustlinesFunded: r.trustlines?.funded ?? null,
    };
  });
}

type TabFilter = "all" | "featured" | "explore";

export default function Tokens() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");

  const { data: featured = [], isLoading: loadingFeatured } = useQuery({
    queryKey: ["featured"],
    queryFn: () => tokenApi.featured(),
  });

  const { data: results, isLoading: searching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => tokenApi.search(query),
    enabled: query.length >= 2,
  });

  const { data: directoryTokens = [], isLoading: loadingDir } = useQuery({
    queryKey: ["stellar-expert-directory"],
    queryFn: fetchDirectory,
    staleTime: 5 * 60_000,
  });

  const featuredList: any[] = Array.isArray(featured) ? featured : (featured as any)?.data || [];
  const searchList: any[] = Array.isArray(results) ? results : (results as any)?.data || [];

  // Merge all tokens (featured + directory, deduplicated)
  const allTokens = useMemo(() => {
    const map = new Map<string, any>();
    featuredList.forEach((tk: any) => map.set(`${tk.assetCode}-${tk.assetIssuer}`, tk));
    directoryTokens.forEach((tk: any) => {
      const key = `${tk.assetCode}-${tk.assetIssuer}`;
      if (!map.has(key)) map.set(key, tk);
    });
    const merged = Array.from(map.values());
    merged.sort((a, b) => (Number(b.ratingAverage) || 0) - (Number(a.ratingAverage) || 0));
    return merged;
  }, [featuredList, directoryTokens]);

  // Display logic
  const displayTokens = useMemo(() => {
    if (query.length >= 2) {
      const q = query.toLowerCase();
      const backendResults = searchList;
      const dirMatches = directoryTokens.filter(
        (tk: any) =>
          tk.assetCode.toLowerCase().includes(q) ||
          tk.tomlName.toLowerCase().includes(q) ||
          (tk.homeDomain || "").toLowerCase().includes(q)
      );
      const map = new Map<string, any>();
      backendResults.forEach((tk: any) => map.set(`${tk.assetCode}-${tk.assetIssuer}`, tk));
      dirMatches.forEach((tk: any) => {
        const key = `${tk.assetCode}-${tk.assetIssuer}`;
        if (!map.has(key)) map.set(key, tk);
      });
      return Array.from(map.values());
    }

    switch (tab) {
      case "featured":
        return featuredList;
      case "explore": {
        const featKeys = new Set(featuredList.map((tk: any) => `${tk.assetCode}-${tk.assetIssuer}`));
        return directoryTokens.filter((tk: any) => !featKeys.has(`${tk.assetCode}-${tk.assetIssuer}`));
      }
      case "all":
      default:
        return allTokens;
    }
  }, [query, tab, searchList, featuredList, directoryTokens, allTokens]);

  const loading = query.length >= 2 ? searching : loadingFeatured || loadingDir;

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("tokens.searchPlaceholder")}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-stellar-card border border-stellar-border text-sm text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
        />
      </div>

      {/* Tabs */}
      {query.length < 2 && (
        <div className="flex gap-1.5">
          {([
            { key: "all" as TabFilter, icon: List, label: t("tokens.allTokens", "All"), count: allTokens.length },
            { key: "featured" as TabFilter, icon: Star, label: t("tokens.featured", "Featured"), count: featuredList.length },
            { key: "explore" as TabFilter, icon: Globe, label: t("tokens.explore", "Explore"), count: directoryTokens.length },
          ]).map(({ key, icon: Icon, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                tab === key
                  ? "bg-stellar-blue/20 text-stellar-blue border border-stellar-blue/40"
                  : "bg-stellar-card border border-stellar-border text-stellar-muted"
              }`}
            >
              <Icon size={10} />
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-stellar-blue" size={24} />
        </div>
      ) : displayTokens.length === 0 ? (
        <p className="text-sm text-stellar-muted text-center py-8">
          {query.length >= 2 ? t("tokens.noSearchResults", { query }) : t("tokens.noFeatured")}
        </p>
      ) : (
        <div className="space-y-1">
          {displayTokens.map((token: any) => (
            <Link
              key={`${token.assetCode}-${token.assetIssuer || "native"}`}
              to={`/tokens/${encodeURIComponent(token.assetCode)}/${encodeURIComponent(token.assetIssuer || "native")}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <TokenIcon code={token.assetCode} image={token.tomlImage} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{token.assetCode}</p>
                <p className="text-xs text-stellar-muted truncate">
                  {token.tomlName || token.homeDomain || ""}
                </p>
              </div>
              <div className="text-right">
                {token.isVerified && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    {t("tokens.verified")}
                  </span>
                )}
                {token.ratingAverage != null && (
                  <p className="text-[10px] text-stellar-muted mt-0.5">
                    {Number(token.ratingAverage).toFixed(1)}/10
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {displayTokens.length > 0 && (
        <p className="text-[10px] text-stellar-muted text-center">
          {t("common.showing", {
            count: displayTokens.length,
            item: displayTokens.length === 1 ? t("common.token") : t("common.tokens"),
          })}
        </p>
      )}
    </div>
  );
}
