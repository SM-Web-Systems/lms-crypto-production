import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../src/shared/store/wallet";
import { nftApi } from "../src/shared/lib/api";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

interface IndexedNft {
  token: {
    id: number;
    tokenIdentifier: string;
    name: string | null;
    imageUrl: string | null;
    description: string | null;
    ownerAddress: string;
  };
  collection: {
    id: number;
    name: string;
    symbol: string | null;
    standard: string;
    imageUrl: string | null;
  } | null;
}

interface ClassicNft {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  totalSupply: number;
  homeDomain: string | null;
  isLocked: boolean;
}

export default function NftsScreen() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => {
    const id = s.activeAccountId;
    return s.accounts.find((a: any) => a.id === id);
  });

  const [indexedNfts, setIndexedNfts] = useState<IndexedNft[]>([]);
  const [classicNfts, setClassicNfts] = useState<ClassicNft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicKey = (activeAccount as any)?.publicKey;

  const fetchNfts = useCallback(async (isRefresh = false) => {
    if (!publicKey) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await nftApi.tokensByOwner(publicKey, true);
      setIndexedNfts(data.indexed?.tokens || []);
      setClassicNfts(data.classicNfts || []);
    } catch (err: any) {
      setError(err.message || "Failed to load NFTs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const hasNfts = indexedNfts.length > 0 || classicNfts.length > 0;

  const renderSorobanNft = ({ item }: { item: IndexedNft }) => (
    <View style={[styles.card, { width: CARD_WIDTH }]}>
      {item.token.imageUrl ? (
        <Image
          source={{ uri: item.token.imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardImage, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>🎨</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.tokenName} numberOfLines={1}>
          {item.token.name || `#${item.token.tokenIdentifier}`}
        </Text>
        {item.collection && (
          <Text style={styles.collectionName} numberOfLines={1}>
            {item.collection.name}
            {item.collection.symbol ? ` · ${item.collection.symbol}` : ""}
          </Text>
        )}
        <View style={styles.badgeSep50}>
          <Text style={styles.badgeText}>SEP-50</Text>
        </View>
      </View>
    </View>
  );

  const renderClassicNft = ({ item, index }: { item: ClassicNft; index: number }) => (
    <View style={styles.classicRow}>
      <View style={styles.classicIcon}>
        <Text style={{ fontSize: 18 }}>💎</Text>
      </View>
      <View style={styles.classicInfo}>
        <Text style={styles.classicCode}>{item.assetCode}</Text>
        <Text style={styles.classicMeta}>
          Supply: {item.totalSupply} · Bal: {item.balance}
        </Text>
        {item.homeDomain && (
          <TouchableOpacity onPress={() => Linking.openURL(`https://${item.homeDomain}`)}>
            <Text style={styles.classicDomain}>{item.homeDomain}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.classicBadges}>
        {item.isLocked && (
          <View style={styles.badgeLocked}>
            <Text style={styles.badgeLockedText}>Locked</Text>
          </View>
        )}
        <View style={styles.badgeSep39}>
          <Text style={styles.badgeSep39Text}>SEP-39</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F9CF9" />
      </View>
    );
  }

  return (
    <FlatList
      data={[]}
      renderItem={() => null}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={styles.title}>{t("nfts.title", "NFT Gallery")}</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {!error && !hasNfts && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🖼️</Text>
              <Text style={styles.emptyText}>{t("nfts.empty", "No NFTs found")}</Text>
              <Text style={styles.emptyHint}>
                {t("nfts.emptyHint", "Soroban (SEP-50) and Classic (SEP-39) NFTs will appear here")}
              </Text>
            </View>
          )}

          {indexedNfts.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>{t("nfts.soroban", "Soroban NFTs")}</Text>
              <FlatList
                data={indexedNfts}
                renderItem={renderSorobanNft}
                keyExtractor={(item) => String(item.token.id)}
                numColumns={2}
                columnWrapperStyle={styles.grid}
                scrollEnabled={false}
              />
            </View>
          )}

          {classicNfts.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>{t("nfts.classic", "Classic Assets (SEP-39)")}</Text>
              {classicNfts.map((nft, i) => renderClassicNft({ item: nft, index: i }))}
            </View>
          )}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchNfts(true)}
          tintColor="#4F9CF9"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0D1117" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0D1117" },
  title: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#8B949E", textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  error: { color: "#F85149", textAlign: "center", paddingVertical: 24 },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#8B949E", fontSize: 14 },
  emptyHint: { color: "#484F58", fontSize: 12, marginTop: 4, textAlign: "center" },
  grid: { justifyContent: "space-between", marginBottom: 8 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: "#21262D", backgroundColor: "#161B22", overflow: "hidden" },
  cardImage: { width: "100%", height: 112 },
  placeholder: { backgroundColor: "rgba(139,92,246,0.08)", justifyContent: "center", alignItems: "center" },
  placeholderEmoji: { fontSize: 28 },
  cardBody: { padding: 10 },
  tokenName: { fontSize: 12, fontWeight: "600", color: "#fff" },
  collectionName: { fontSize: 10, color: "#8B949E", marginTop: 2 },
  badgeSep50: { marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(139,92,246,0.1)" },
  badgeText: { fontSize: 9, color: "#A78BFA" },
  classicRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#21262D", backgroundColor: "#161B22", marginBottom: 6 },
  classicIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.08)", justifyContent: "center", alignItems: "center" },
  classicInfo: { flex: 1, marginLeft: 10 },
  classicCode: { fontSize: 12, fontWeight: "600", color: "#fff" },
  classicMeta: { fontSize: 10, color: "#8B949E" },
  classicDomain: { fontSize: 10, color: "#58A6FF", marginTop: 2 },
  classicBadges: { flexDirection: "row", alignItems: "center", gap: 4 },
  badgeLocked: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(63,185,80,0.1)" },
  badgeLockedText: { fontSize: 9, color: "#3FB950" },
  badgeSep39: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(245,158,11,0.1)" },
  badgeSep39Text: { fontSize: 9, color: "#D97706" },
});
