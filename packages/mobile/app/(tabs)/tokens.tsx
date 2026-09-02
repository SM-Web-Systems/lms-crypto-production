import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Star,
  ChevronRight,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react-native";
import { useWalletStore } from "../../src/shared/store/wallet";

const API_BASE = "https://ammawallet.com";

interface TokenItem {
  id: string;
  code: string;
  issuer: string;
  balance: string;
  isFavorite: boolean;
  isNative: boolean;
  tomlName?: string;
  tomlImage?: string;
  ratingAverage?: number | null;
  domain?: string;
  isVerified?: boolean;
  tokenId?: number | null;
  limit?: string | null;
}

// ─── Fetch user's tokens via backend (enriched, batched) ───
async function fetchAccountTokens(publicKey: string): Promise<TokenItem[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/tokens/user/${publicKey}`
  );
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error("Failed to fetch tokens");
  }
  const data = await res.json();
  if (data.error) return [];

  return data.map((t: any) => ({
    id:
      t.assetType === "native"
        ? "XLM"
        : `${t.assetCode}-${t.assetIssuer}`,
    code: t.assetCode,
    issuer: t.assetIssuer || "native",
    balance: parseFloat(t.balance).toFixed(4),
    isFavorite: t.isFavorite ?? false,
    isNative: t.assetType === "native",
    tomlName: t.token?.tomlName || "",
    tomlImage: t.token?.tomlImage || "",
    ratingAverage: t.token?.ratingAverage ?? null,
    domain: t.token?.domain || "",
    isVerified: t.token?.isVerified ?? false,
    tokenId: t.token?.id ?? null,
    limit: t.limit || null,
  }));
}

// ─── Fetch explore directory via backend ───
async function fetchAssetDirectory(): Promise<TokenItem[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/tokens/directory?order=desc&limit=200`
  );
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
      id: raw,
      code,
      issuer,
      balance: "—",
      isFavorite: false,
      isNative: false,
      tomlName: r.tomlInfo?.name || r.tomlInfo?.orgName || "",
      tomlImage: r.tomlInfo?.image || "",
      ratingAverage: r.rating?.average ?? null,
      domain: r.home_domain || "",
      isVerified: (r.rating?.average ?? 0) >= 6,
    };
  });
}

type TabFilter = "all" | "favorites" | "directory";
type SortKey = "balance" | "name" | "rating";

export default function TokensScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { accounts, activeAccountId } = useWalletStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("balance");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [addingToken, setAddingToken] = useState<string | null>(null);

  const {
    data: myTokens = [],
    isLoading: loadingMy,
    refetch: refetchMy,
  } = useQuery({
    queryKey: ["tokens", activeAccount?.publicKey],
    queryFn: () => fetchAccountTokens(activeAccount!.publicKey),
    enabled: !!activeAccount,
    staleTime: 30_000,
  });

  const {
    data: directoryTokens = [],
    isLoading: loadingDir,
    refetch: refetchDir,
  } = useQuery({
    queryKey: ["asset-directory"],
    queryFn: fetchAssetDirectory,
    staleTime: 5 * 60_000,
  });

  const isLoading = loadingMy || loadingDir;

  const onRefresh = useCallback(() => {
    refetchMy();
    refetchDir();
  }, [refetchMy, refetchDir]);

  // ─── Add trustline handler ───
  const handleAddTrustline = useCallback(
    async (code: string, issuer: string) => {
      if (!activeAccount?.publicKey || addingToken) return;

      const tokenKey = `${code}-${issuer}`;
      setAddingToken(tokenKey);

      try {
        // Step 1: Pre-flight check
        const checkRes = await fetch(
          `${API_BASE}/api/v1/trustlines/check/${activeAccount.publicKey}/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}`
        );
        const check = await checkRes.json();

        if (check.alreadyTrusted) {
          Alert.alert(
            t("trustlines.alreadyAdded", "Already Added"),
            t(
              "trustlines.alreadyAddedDesc",
              "You already have a trustline for this asset."
            )
          );
          return;
        }
        if (!check.assetExists) {
          Alert.alert(
            t("trustlines.notFound", "Asset Not Found"),
            t(
              "trustlines.notFoundDesc",
              "This asset could not be verified on the Stellar network."
            )
          );
          return;
        }
        if (!check.hasEnoughXlm) {
          Alert.alert(
            t("trustlines.insufficientXlm", "Insufficient XLM"),
            t("trustlines.insufficientXlmDesc", {
              defaultValue: `You need at least 0.5 XLM available to add a trustline.\nAvailable: ${check.availableXlm} XLM`,
              available: check.availableXlm,
            })
          );
          return;
        }

        // Step 2: Confirm with user
        Alert.alert(
          t("trustlines.addTitle", "Add {{code}}?", { code }),
          t("trustlines.addConfirm", {
            defaultValue: `This will reserve 0.5 XLM from your balance.\n\nYou'll be able to receive ${code} tokens after this.`,
            code,
          }),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel" },
            {
              text: t("trustlines.addButton", "Add Trustline"),
              onPress: async () => {
                try {
                  // Step 3: Build TX
                  const buildRes = await fetch(
                    `${API_BASE}/api/v1/trustlines/add`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        publicKey: activeAccount.publicKey,
                        assetCode: code,
                        assetIssuer: issuer,
                      }),
                    }
                  );
                  const { xdr, networkPassphrase, error } =
                    await buildRes.json();
                  if (error) throw new Error(error);

                  // Step 4: Sign client-side
                  const { signAndSubmitXdr } = await import(
                    "../../src/shared/lib/stellar"
                  );
                  await signAndSubmitXdr(xdr, networkPassphrase);

                  // Step 5: Refresh
                  queryClient.invalidateQueries({
                    queryKey: ["tokens"],
                  });
                  refetchMy();

                  Alert.alert(
                    t("common.success", "Success"),
                    t("trustlines.added", "{{code}} added to your wallet!", {
                      code,
                    })
                  );
                } catch (e: any) {
                  Alert.alert(
                    t("common.error", "Error"),
                    e.message || "Failed to add trustline"
                  );
                }
              },
            },
          ]
        );
      } catch (e: any) {
        Alert.alert(
          t("common.error", "Error"),
          e.message || "Failed to check trustline"
        );
      } finally {
        setAddingToken(null);
      }
    },
    [activeAccount, addingToken, queryClient, refetchMy, t]
  );

  // ─── Sort & filter ───
  const displayTokens = useMemo(() => {
    let list: TokenItem[];

    switch (tab) {
      case "favorites":
        list = myTokens.filter((t) => t.isFavorite);
        break;
      case "directory": {
        const myIds = new Set(myTokens.map((t) => t.id));
        list = directoryTokens.filter((t) => !myIds.has(t.id));
        break;
      }
      case "all":
      default:
        list = myTokens;
        break;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          (t.tomlName || "").toLowerCase().includes(q) ||
          (t.domain || "").toLowerCase().includes(q)
      );
    }

    // Sort (only for "all" and "favorites" — directory has its own order)
    if (tab !== "directory") {
      list = [...list].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.code.localeCompare(b.code);
          case "rating": {
            const ra = Number(a.ratingAverage || 0);
            const rb = Number(b.ratingAverage || 0);
            return rb - ra;
          }
          case "balance":
          default: {
            // XLM always first
            if (a.isNative) return -1;
            if (b.isNative) return 1;
            return parseFloat(b.balance) - parseFloat(a.balance);
          }
        }
      });
    }

    return list;
  }, [tab, myTokens, directoryTokens, search, sortBy]);

  // ─── Token row renderer ───
  const renderToken = ({ item }: { item: TokenItem }) => {
    const isDirectory = tab === "directory";
    const isAdding = addingToken === `${item.code}-${item.issuer}`;

    return (
      <TouchableOpacity
        style={styles.tokenRow}
        onPress={() =>
          router.push({
            pathname: "/token-detail",
            params: { code: item.code, issuer: item.issuer },
          })
        }
        activeOpacity={0.7}
      >
        {/* Icon */}
        {item.tomlImage ? (
          <Image
            source={{ uri: item.tomlImage }}
            style={styles.tokenIconImg}
            defaultSource={require("../../assets/token-placeholder.png")}
          />
        ) : (
          <View style={styles.tokenIcon}>
            <Text style={styles.tokenIconText}>
              {item.code.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.tokenInfo}>
          <View style={styles.tokenNameRow}>
            <Text style={styles.tokenCode}>{item.code}</Text>
            {item.isFavorite && (
              <Star size={14} color="#f59e0b" fill="#f59e0b" />
            )}
            {item.isVerified && (
              <CheckCircle2 size={12} color="#10b981" />
            )}
          </View>
          <Text style={styles.tokenIssuer} numberOfLines={1}>
            {item.isNative
              ? "Stellar Native"
              : item.tomlName
              ? item.tomlName
              : item.domain
              ? item.domain
              : `${item.issuer.slice(0, 8)}…${item.issuer.slice(-4)}`}
          </Text>
        </View>

        {/* Right side: balance OR add button */}
        {isDirectory ? (
          <TouchableOpacity
            onPress={() => handleAddTrustline(item.code, item.issuer)}
            disabled={isAdding}
            style={[
              styles.addButton,
              isAdding && styles.addButtonDisabled,
            ]}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Plus size={14} color="#fff" />
                <Text style={styles.addButtonText}>
                  {t("tokens.add", "Add")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.tokenBalance}>
              <Text style={styles.balanceText}>{item.balance}</Text>
              {item.ratingAverage != null && (
                <Text style={styles.ratingText}>
                  {Number(item.ratingAverage).toFixed(1)}/10
                </Text>
              )}
            </View>
            <ChevronRight size={16} color="#6b7280" />
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={styles.headerTitle}>{t("tokens.title")}</Text>
          <TouchableOpacity
            onPress={() => setShowCustomModal(true)}
            style={styles.customAddBtn}
          >
            <Plus size={16} color="#8b5cf6" />
            <Text style={styles.customAddBtnText}>
              {t("tokens.custom", "Custom")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>
          {myTokens.length} {t("tokens.held")}
          {directoryTokens.length > 0 &&
            ` · ${directoryTokens.length} ${t("tokens.available")}`}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Search size={18} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder={t("tokens.searchPlaceholder")}
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <X size={16} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["all", "favorites", "directory"] as TabFilter[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text
              style={[styles.tabText, tab === key && styles.tabTextActive]}
            >
              {key === "all"
                ? `${t("tokens.myTokens")} (${myTokens.length})`
                : key === "favorites"
                ? `★ (${myTokens.filter((t) => t.isFavorite).length})`
                : `${t("tokens.explore")} (${directoryTokens.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort chips (only for my tokens / favorites) */}
      {tab !== "directory" && (
        <View style={styles.sortRow}>
          {(["balance", "name", "rating"] as SortKey[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.sortChip,
                sortBy === key && styles.sortChipActive,
              ]}
              onPress={() => setSortBy(key)}
            >
              <Text
                style={[
                  styles.sortText,
                  sortBy === key && styles.sortTextActive,
                ]}
              >
                {key === "balance"
                  ? t("tokens.sortBalance", "Balance")
                  : key === "name"
                  ? "A-Z"
                  : t("tokens.sortRating", "Rating")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* List */}
      {isLoading && displayTokens.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : displayTokens.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {search
              ? t("tokens.noSearchResults")
              : tab === "favorites"
              ? t("tokens.noFavorites")
              : t("tokens.noTokens")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayTokens}
          keyExtractor={(item) => item.id}
          renderItem={renderToken}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor="#8b5cf6"
            />
          }
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={10}
        />
      )}

      {/* Custom Token Modal */}
      <CustomTokenModal
        visible={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        publicKey={activeAccount?.publicKey || ""}
        onAdded={() => {
          setShowCustomModal(false);
          refetchMy();
          queryClient.invalidateQueries({ queryKey: ["tokens"] });
        }}
      />
    </View>
  );
}

// ═══════════════════════════════════════════
// Custom Token Modal
// ═══════════════════════════════════════════
function CustomTokenModal({
  visible,
  onClose,
  publicKey,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  publicKey: string;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [assetCode, setAssetCode] = useState("");
  const [assetIssuer, setAssetIssuer] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);

  const reset = () => {
    setAssetCode("");
    setAssetIssuer("");
    setCheckResult(null);
    setChecking(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCheck = async () => {
    if (!assetCode.trim() || !assetIssuer.trim()) {
      Alert.alert("Missing Fields", "Enter both asset code and issuer address.");
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/trustlines/check/${publicKey}/${encodeURIComponent(assetCode.trim())}/${encodeURIComponent(assetIssuer.trim())}`
      );
      const data = await res.json();
      setCheckResult(data);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setChecking(false);
    }
  };

  const handleAdd = async () => {
    setSubmitting(true);
    try {
      const buildRes = await fetch(`${API_BASE}/api/v1/trustlines/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey,
          assetCode: assetCode.trim(),
          assetIssuer: assetIssuer.trim(),
        }),
      });
      const { xdr, networkPassphrase, error } = await buildRes.json();
      if (error) throw new Error(error);

      const { signAndSubmitXdr } = await import(
        "../../src/shared/lib/stellar"
      );
      await signAndSubmitXdr(xdr, networkPassphrase);

      Alert.alert("Success", `${assetCode} trustline added!`);
      reset();
      onAdded();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add trustline");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={modalStyles.container}>
        {/* Header */}
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>
            {t("tokens.addCustom", "Add Custom Token")}
          </Text>
          <TouchableOpacity onPress={handleClose}>
            <X size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={modalStyles.infoBox}>
          <AlertCircle size={16} color="#f59e0b" />
          <Text style={modalStyles.infoText}>
            {t(
              "tokens.customInfo",
              "Enter the exact asset code and issuer address. Adding a trustline reserves 0.5 XLM."
            )}
          </Text>
        </View>

        {/* Inputs */}
        <Text style={modalStyles.label}>
          {t("tokens.assetCode", "Asset Code")}
        </Text>
        <TextInput
          style={modalStyles.input}
          placeholder="e.g. USDC, BTC, yXLM"
          placeholderTextColor="#4b5563"
          value={assetCode}
          onChangeText={(v) => {
            setAssetCode(v.toUpperCase());
            setCheckResult(null);
          }}
          autoCapitalize="characters"
          maxLength={12}
        />

        <Text style={modalStyles.label}>
          {t("tokens.issuerAddress", "Issuer Address")}
        </Text>
        <TextInput
          style={[modalStyles.input, { fontSize: 12 }]}
          placeholder="G..."
          placeholderTextColor="#4b5563"
          value={assetIssuer}
          onChangeText={(v) => {
            setAssetIssuer(v);
            setCheckResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Check Result */}
        {checkResult && (
          <View style={modalStyles.resultBox}>
            <ResultRow
              ok={checkResult.assetExists}
              label={
                checkResult.assetExists
                  ? t("tokens.assetVerified", "Asset exists on Stellar")
                  : t("tokens.assetNotFound", "Asset not found on network")
              }
            />
            <ResultRow
              ok={!checkResult.alreadyTrusted}
              label={
                checkResult.alreadyTrusted
                  ? t(
                      "tokens.alreadyTrusted",
                      "You already trust this asset"
                    )
                  : t("tokens.notYetTrusted", "Not yet in your wallet")
              }
            />
            <ResultRow
              ok={checkResult.hasEnoughXlm}
              label={
                checkResult.hasEnoughXlm
                  ? `${t("tokens.xlmAvailable", "Available")}: ${checkResult.availableXlm} XLM`
                  : `${t("tokens.needXlm", "Need 0.5 XLM, have")} ${checkResult.availableXlm}`
              }
            />
          </View>
        )}

        {/* Action Button */}
        {!checkResult ? (
          <TouchableOpacity
            style={[
              modalStyles.actionBtn,
              (!assetCode.trim() || !assetIssuer.trim()) &&
                modalStyles.actionBtnDisabled,
            ]}
            onPress={handleCheck}
            disabled={checking || !assetCode.trim() || !assetIssuer.trim()}
          >
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={modalStyles.actionBtnText}>
                {t("tokens.verify", "Verify Asset")}
              </Text>
            )}
          </TouchableOpacity>
        ) : checkResult.canAdd ? (
          <TouchableOpacity
            style={[modalStyles.actionBtn, { backgroundColor: "#10b981" }]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={modalStyles.actionBtnText}>
                {t("tokens.addTrustline", "Add Trustline (0.5 XLM)")}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[modalStyles.actionBtn, { backgroundColor: "#374151" }]}
            onPress={() => setCheckResult(null)}
          >
            <Text style={modalStyles.actionBtnText}>
              {t("common.tryAgain", "Try Again")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

function ResultRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 4,
      }}
    >
      {ok ? (
        <CheckCircle2 size={14} color="#10b981" />
      ) : (
        <AlertCircle size={14} color="#ef4444" />
      )}
      <Text style={{ color: ok ? "#10b981" : "#ef4444", fontSize: 13 }}>
        {label}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  headerSubtitle: { color: "#9ca3af", fontSize: 13, marginTop: 4 },
  customAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1e293b",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8b5cf6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  customAddBtnText: { color: "#8b5cf6", fontSize: 12, fontWeight: "600" },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 15, marginLeft: 8 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 4,
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1e293b",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#2e1065",
    borderWidth: 1,
    borderColor: "#8b5cf6",
  },
  tabText: { color: "#9ca3af", fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: "#8b5cf6" },
  sortRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#1e293b",
  },
  sortChipActive: {
    backgroundColor: "#1e3a5f",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  sortText: { color: "#6b7280", fontSize: 11, fontWeight: "500" },
  sortTextActive: { color: "#3b82f6" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  tokenIconImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#334155",
  },
  tokenIconText: { color: "#8b5cf6", fontSize: 14, fontWeight: "700" },
  tokenInfo: { flex: 1, marginLeft: 12 },
  tokenNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tokenCode: { color: "#fff", fontSize: 16, fontWeight: "600" },
  tokenIssuer: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  tokenBalance: { marginRight: 8, alignItems: "flex-end" },
  balanceText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  ratingText: { color: "#f59e0b", fontSize: 10, marginTop: 2 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonDisabled: { backgroundColor: "#374151" },
  addButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#9ca3af", marginTop: 12 },
  emptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: { color: "#6b7280", fontSize: 15, textAlign: "center" },
});

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    padding: 12,
    marginBottom: 20,
  },
  infoText: { flex: 1, color: "#f59e0b", fontSize: 12, lineHeight: 18 },
  label: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultBox: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 12,
    marginTop: 16,
  },
  actionBtn: {
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  actionBtnDisabled: { backgroundColor: "#374151" },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
