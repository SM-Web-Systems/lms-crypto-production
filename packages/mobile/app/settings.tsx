import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogOut,
  ChevronRight,
  User,
  Wallet,
  Shield,
  RefreshCw,
} from "lucide-react-native";
import { useWalletStore } from "../src/shared/store/wallet";
import { useAuthStore } from "../src/shared/store/auth";
import PinModal from "../src/components/PinModal";
import { ShieldCheck } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { signingApi } from "../src/shared/lib/api";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "af", label: "Afrikaans" },
  { code: "ar", label: "العربية" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "nr", label: "isiNdebele" },
  { code: "nso", label: "Sepedi" },
  { code: "pt", label: "Português" },
  { code: "sn", label: "chiShona" },
  { code: "ss", label: "siSwati" },
  { code: "st", label: "Sesotho" },
  { code: "sw", label: "Kiswahili" },
  { code: "tn", label: "Setswana" },
  { code: "ts", label: "Xitsonga" },
  { code: "ve", label: "Tshivenda" },
  { code: "xh", label: "isiXhosa" },
  { code: "zh", label: "中文" },
  { code: "zu", label: "isiZulu" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  // Wallet store
  const {
    accounts,
    activeAccountId,
    network,
    setNetwork,
    lock,
    logout: walletLogout,
    getSecretKey,
    unlock,
  } = useWalletStore();

  // Auth store
  const { user, logout: authLogout } = useAuthStore();

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  // UI state
  const [showPinModal, setShowPinModal] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  // Copy public key
  const copyPublicKey = async () => {
    if (!activeAccount) return;
    await Clipboard.setStringAsync(activeAccount.publicKey);
    Alert.alert(t("common.success"), t("receive.copied"));
  };

  // Reveal secret key: unlock wallet with PIN, then read the secret
  const handleRevealSecret = async (pin: string) => {
    await unlock(pin); // throws if PIN/secret invalid
    const key = getSecretKey(); // no arguments — reads _secretKey from state
    if (!key) throw new Error("Failed to retrieve secret key");
    setRevealedKey(key);
    setShowKey(true);
  };

  // Copy secret key
  const copySecretKey = async () => {
    if (!revealedKey) return;
    await Clipboard.setStringAsync(revealedKey);
    Alert.alert(t("common.success"), t("receive.copied"));
  };

  // Lock the app
  const handleLock = () => {
    lock();
    setRevealedKey(null);
    setShowKey(false);
    router.replace("/lock-screen");
  };

  // Full logout: clear wallet + auth
  const handleLogout = () => {
    Alert.alert(t("settings.logoutTitle"), t("settings.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logout"),
        style: "destructive",
        onPress: () => {
          walletLogout();   // clears accounts, activeAccountId, locks
          authLogout();     // clears JWT, user, PIN
          setRevealedKey(null);
          setShowKey(false);
          router.replace("/login");
        },
      },
    ]);
  };

  // Change language
  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setShowLangPicker(false);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("settings.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Profile Section */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings.profile")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <User size={20} color="#8b5cf6" />
              <View style={styles.rowText}>
                <Text style={styles.label}>{t("auth.email")}</Text>
                <Text style={styles.value}>{user.email}</Text>
              </View>
            </View>
            {user.firstName && (
              <View style={styles.row}>
                <User size={20} color="#8b5cf6" />
                <View style={styles.rowText}>
                  <Text style={styles.label}>{t("settings.name")}</Text>
                  <Text style={styles.value}>{user.lastName}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Active Wallet Section */}
      {activeAccount && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("settings.activeWallet")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Wallet size={20} color="#8b5cf6" />
              <View style={styles.rowText}>
                <Text style={styles.label}>{activeAccount.name}</Text>
                <Text style={styles.valueMono} numberOfLines={1}>
                  {activeAccount.publicKey.slice(0, 12)}...{activeAccount.publicKey.slice(-8)}
                </Text>
              </View>
              <TouchableOpacity onPress={copyPublicKey}>
                <Copy size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* Secret Key */}
            <View style={styles.divider} />
            <View style={styles.row}>
              <Shield size={20} color="#f59e0b" />
              <View style={styles.rowText}>
                <Text style={styles.label}>{t("settings.secretKey")}</Text>
                {showKey && revealedKey ? (
                  <Text style={styles.valueMono} numberOfLines={1}>
                    {revealedKey.slice(0, 12)}...{revealedKey.slice(-8)}
                  </Text>
                ) : (
                  <Text style={styles.valueHidden}>••••••••••••••••</Text>
                )}
              </View>
              {showKey && revealedKey ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={copySecretKey} style={styles.iconBtn}>
                    <Copy size={18} color="#9ca3af" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowKey(false);
                      setRevealedKey(null);
                    }}
                    style={styles.iconBtn}
                  >
                    <EyeOff size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setShowPinModal(true)}>
                  <Eye size={18} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
            {/* Recovery Phrase (if HD wallet) */}
            {activeAccount?.isHD && (
              <>
                <View style={styles.divider} />
                <RecoveryPhraseReveal publicKey={activeAccount.publicKey} />
              </>
            )}
          </View>
        </View>
      )}

      {/* Language Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => setShowLangPicker(!showLangPicker)}
        >
          <View style={styles.row}>
            <Globe size={20} color="#8b5cf6" />
            <View style={styles.rowText}>
              <Text style={styles.value}>
                {LANGUAGES.find((l) => l.code === i18n.language)?.label || i18n.language}
              </Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </View>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={styles.langGrid}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langBtn,
                  i18n.language === lang.code && styles.langBtnActive,
                ]}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    i18n.language === lang.code && styles.langBtnTextActive,
                  ]}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Network Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.network")}</Text>
        <View style={styles.card}>
          <View style={styles.networkRow}>
            <TouchableOpacity
              style={[
                styles.networkBtn,
                network === "testnet" && styles.networkBtnActive,
              ]}
              onPress={() => setNetwork("testnet")}
            >
              <Text
                style={[
                  styles.networkBtnText,
                  network === "testnet" && styles.networkBtnTextActive,
                ]}
              >
                Testnet
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.networkBtn,
                network === "public" && styles.networkBtnActive,
              ]}
              onPress={() => setNetwork("public")}
            >
              <Text
                style={[
                  styles.networkBtnText,
                  network === "public" && styles.networkBtnTextActive,
                ]}
              >
                Mainnet
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Signing Mode */}
      <SigningModeToggle />

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLock}>
          <Lock size={20} color="#8b5cf6" />
          <Text style={styles.actionBtnText}>{t("settings.lockApp")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDanger]}
          onPress={handleLogout}
        >
          <LogOut size={20} color="#ef4444" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>
            {t("settings.logout")}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* PIN Modal for secret key reveal */}
      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onConfirm={handleRevealSecret}
        title={t("pin.enterToProceed")}
      />
    </ScrollView>
  );
}

function SigningModeToggle() {
  const { t } = useTranslation();
  const { signingMode } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const currentMode = signingMode || "self";

  const handleToggle = async (mode: "self" | "delegated") => {
    if (mode === currentMode) return;

    if (mode === "delegated") {
      Alert.alert(
        t("settings.delegatedWarningTitle", "Enable Delegated Signing?"),
        t(
          "settings.delegatedWarningMessage",
          "Your secret key stored on the server will be used to sign transactions. This is convenient but less secure than self-custody. Only enable this if you trust the server."
        ),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.confirm", "Enable"),
            style: "destructive",
            onPress: () => switchMode(mode),
          },
        ]
      );
    } else {
      switchMode(mode);
    }
  };

  const switchMode = async (mode: "self" | "delegated") => {
    setLoading(true);
    try {
      await signingApi.setMode(mode);
      useAuthStore.setState({ signingMode: mode });
      Alert.alert(
        t("common.success"),
        mode === "delegated"
          ? t(
              "settings.delegatedEnabled",
              "Delegated signing enabled. The server will sign transactions for you."
            )
          : t(
              "settings.selfEnabled",
              "Self-custody enabled. You sign transactions locally."
            )
      );
    } catch (err: any) {
      Alert.alert(
        t("common.error"),
        err.message || "Failed to update signing mode"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t("settings.signingMode", "Signing Mode")}
      </Text>
      <View style={styles.card}>
        {loading && (
          <ActivityIndicator
            size="small"
            color="#8b5cf6"
            style={{ marginBottom: 12 }}
          />
        )}
        <View style={styles.networkRow}>
          <TouchableOpacity
            style={[
              styles.networkBtn,
              { flexDirection: "row", gap: 6, justifyContent: "center" },
              currentMode === "self" && styles.networkBtnActive,
            ]}
            onPress={() => handleToggle("self")}
            disabled={loading}
          >
            <Shield
              size={16}
              color={currentMode === "self" ? "#8b5cf6" : "#9ca3af"}
            />
            <Text
              style={[
                styles.networkBtnText,
                currentMode === "self" && styles.networkBtnTextActive,
              ]}
            >
              {t("settings.selfCustody", "Self-Custody")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.networkBtn,
              { flexDirection: "row", gap: 6, justifyContent: "center" },
              currentMode === "delegated" && styles.networkBtnActive,
            ]}
            onPress={() => handleToggle("delegated")}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              color={currentMode === "delegated" ? "#8b5cf6" : "#9ca3af"}
            />
            <Text
              style={[
                styles.networkBtnText,
                currentMode === "delegated" && styles.networkBtnTextActive,
              ]}
            >
              {t("settings.delegated", "Delegated")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text
          style={{
            color: "#6b7280",
            fontSize: 12,
            marginTop: 10,
            lineHeight: 18,
          }}
        >
          {currentMode === "self"
            ? t(
                "settings.selfCustodyDesc",
                "Transactions are signed locally on your device using your secret key."
              )
            : t(
                "settings.delegatedDesc",
                "Transactions are signed by the server. More convenient, but requires trusting the server with your key."
              )}
        </Text>
      </View>
    </View>
  );
}

function RecoveryPhraseReveal({ publicKey }: { publicKey: string }) {
  const { t } = useTranslation();
  const [showPinModal, setShowPinModal] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const { unlock, getSecretKey } = useWalletStore();

  const handleReveal = async (pin: string) => {
    await unlock(pin);
    const mnemonic = await SecureStore.getItemAsync(`mnemonic_${publicKey}`);
    if (!mnemonic) throw new Error("No recovery phrase found for this wallet");
    setPhrase(mnemonic);
    setVisible(true);
  };

  const handleCopy = async () => {
    if (phrase) {
      await Clipboard.setStringAsync(phrase);
      Alert.alert(t("common.success"), t("receive.copied"));
    }
  };

  const handleHide = () => {
    setPhrase(null);
    setVisible(false);
  };

  return (
    <>
      <View style={styles.row}>
        <ShieldCheck size={20} color="#10b981" />
        <View style={styles.rowText}>
          <Text style={styles.label}>
            {t("settings.recoveryPhrase", "Recovery Phrase")}
          </Text>
          {visible && phrase ? (
            <Text style={[styles.valueMono, { fontSize: 11, lineHeight: 18 }]}>
              {phrase}
            </Text>
          ) : (
            <Text style={styles.valueHidden}>
              ●●●●● ●●●●● ●●●●● ●●●●● ●●●●●
            </Text>
          )}
        </View>
        {visible && phrase ? (
          <View style={styles.rowActions}>
            <TouchableOpacity onPress={handleCopy} style={styles.iconBtn}>
              <Copy size={18} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleHide} style={styles.iconBtn}>
              <EyeOff size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowPinModal(true)}>
            <Eye size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onConfirm={handleReveal}
        title={t("pin.enterToProceed")}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowText: { flex: 1, marginLeft: 12 },
  rowActions: { flexDirection: "row", gap: 8 },
  iconBtn: { padding: 4 },
  label: { color: "#9ca3af", fontSize: 12 },
  value: { color: "#fff", fontSize: 15 },
  valueMono: { color: "#fff", fontSize: 13, fontFamily: "monospace" },
  valueHidden: { color: "#6b7280", fontSize: 13 },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 8 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  langBtn: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  langBtnActive: { borderColor: "#8b5cf6", backgroundColor: "#2e1065" },
  langBtnText: { color: "#9ca3af", fontSize: 13 },
  langBtnTextActive: { color: "#8b5cf6" },
  networkRow: { flexDirection: "row", gap: 8 },
  networkBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  networkBtnActive: { borderColor: "#8b5cf6", backgroundColor: "#2e1065" },
  networkBtnText: { color: "#9ca3af", fontSize: 14, fontWeight: "600" },
  networkBtnTextActive: { color: "#8b5cf6" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  actionBtnDanger: { borderWidth: 1, borderColor: "#7f1d1d" },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  actionBtnTextDanger: { color: "#ef4444" },
});
