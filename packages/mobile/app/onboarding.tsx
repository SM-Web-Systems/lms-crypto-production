import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useWalletStore } from "../src/shared/store/wallet";

type Mode = "choose" | "create" | "backup" | "verify" | "import" | "import-choice";

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const {
    createWallet,
    createWalletFromMnemonic,
    importWallet,
    importFromMnemonic,
    generateMnemonic,
    accounts,
  } = useWalletStore();
  const hasExisting = accounts.length > 0;

  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [secret, setSecret] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Verification state
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyAnswers, setVerifyAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (action === "create") setMode("create");
    else if (action === "import") setMode("import-choice");
  }, [action]);

  const reset = () => {
    setName("");
    setPin("");
    setSecret("");
    setMnemonic("");
    setMnemonicInput("");
    setError("");
    setCopied(false);
    setVerifyAnswers({});
    setVerifyIndices([]);
  };

  const goBack = () => {
    if (mode === "verify") {
      setMode("backup");
      setVerifyAnswers({});
      return;
    }
    if (mode === "backup") {
      setMode("create");
      return;
    }
    if (mode === "import") {
      setMode("import-choice");
      return;
    }
    if (hasExisting) {
      router.back();
    } else {
      reset();
      setMode("choose");
    }
  };

  // ─── Step 1: Create — collect name + PIN, generate mnemonic ───
  const handleCreateStep1 = () => {
    if (!name.trim()) {
      setError(t("onboarding.nameRequired", "Wallet name is required"));
      return;
    }
    if (pin.length < 6) {
      setError(t("onboarding.pinMin", "PIN must be at least 6 characters"));
      return;
    }
    setError("");
    const newMnemonic = generateMnemonic();
    setMnemonic(newMnemonic);
    setMode("backup");
  };

  // ─── Step 2: Backup — user has copied/written down the mnemonic ───
  const handleBackupDone = () => {
    // Pick 3 random word indices for verification
    const words = mnemonic.split(" ");
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * words.length);
      if (!indices.includes(idx)) indices.push(idx);
    }
    indices.sort((a, b) => a - b);
    setVerifyIndices(indices);
    setVerifyAnswers({});
    setMode("verify");
  };

  // ─── Step 3: Verify — check 3 random words ───
  const handleVerifyAndCreate = async () => {
    const words = mnemonic.split(" ");
    for (const idx of verifyIndices) {
      if (
        (verifyAnswers[idx] || "").trim().toLowerCase() !==
        words[idx].toLowerCase()
      ) {
        setError(
          t(
            "onboarding.verifyFailed",
            "Incorrect word. Please check your backup and try again."
          )
        );
        return;
      }
    }

    setError("");
    setLoading(true);
    try {
      await createWalletFromMnemonic(name.trim(), pin, mnemonic, 0);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Skip verification (not recommended) ───
  const handleSkipVerification = () => {
    Alert.alert(
      t("onboarding.skipTitle", "Skip Verification?"),
      t(
        "onboarding.skipMessage",
        "If you lose your recovery phrase, you will lose access to your funds forever. Are you sure?"
      ),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("onboarding.skipConfirm", "I understand, skip"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await createWalletFromMnemonic(name.trim(), pin, mnemonic, 0);
              router.replace("/(tabs)");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ─── Import from secret key (legacy) ───
  const handleImportSecret = async () => {
    if (!name.trim() || pin.length < 6 || !secret.trim()) {
      setError(t("onboarding.fillAll", "Please fill all fields"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await importWallet(name.trim(), secret.trim(), pin);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Import from mnemonic ───
  const handleImportMnemonic = async () => {
    if (!name.trim() || pin.length < 6 || !mnemonicInput.trim()) {
      setError(t("onboarding.fillAll", "Please fill all fields"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await importFromMnemonic(name.trim(), mnemonicInput.trim(), pin, 0);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyMnemonic = async () => {
    await Clipboard.setStringAsync(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const mnemonicWords = mnemonic.split(" ");

  // ═══════════════════════════════════════
  // CHOOSE MODE
  // ═══════════════════════════════════════
  if (mode === "choose") {
    return (
      <View style={s.centerContainer}>
        <View style={s.logo} />
        <Text style={s.title}>Amma Wallet</Text>
        <Text style={s.subtitle}>
          {t("onboarding.subtitle", "Your gateway to the Stellar network")}
        </Text>
        <TouchableOpacity
          onPress={() => setMode("create")}
          style={s.primaryBtn}
        >
          <Text style={s.primaryBtnText}>
            {t("onboarding.createWallet", "Create New Wallet")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode("import-choice")}
          style={s.outlineBtn}
        >
          <Text style={s.outlineBtnText}>
            {t("onboarding.importWallet", "Import Wallet")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════════════════════════════
  // IMPORT CHOICE: Secret Key vs Mnemonic
  // ═══════════════════════════════════════
  if (mode === "import-choice") {
    return (
      <View style={s.formContainer}>
        <TouchableOpacity onPress={goBack}>
          <Text style={s.backText}>
            ← {hasExisting ? t("common.back", "Back") : t("common.back", "Back")}
          </Text>
        </TouchableOpacity>

        <Text style={s.formTitle}>
          {t("onboarding.importWallet", "Import Wallet")}
        </Text>
        <Text style={s.formSubtitle}>
          {t("onboarding.importChoiceDesc", "Choose how to import your wallet")}
        </Text>

        <TouchableOpacity
          onPress={() => {
            reset();
            setMode("import");
          }}
          style={s.choiceCard}
        >
          <ShieldCheck size={24} color="#8b5cf6" />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.choiceTitle}>
              {t("onboarding.recoverMnemonic", "Recovery Phrase")}
            </Text>
            <Text style={s.choiceDesc}>
              {t(
                "onboarding.recoverMnemonicDesc",
                "12 or 24 words from another wallet"
              )}
            </Text>
          </View>
          <ChevronLeft
            size={18}
            color="#6b7280"
            style={{ transform: [{ rotate: "180deg" }] }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            reset();
            setMode("import");
            setMnemonicInput("__SECRET_KEY_MODE__"); // flag
          }}
          style={s.choiceCard}
        >
          <Eye size={24} color="#f59e0b" />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.choiceTitle}>
              {t("onboarding.importSecretKey", "Secret Key")}
            </Text>
            <Text style={s.choiceDesc}>
              {t("onboarding.importSecretKeyDesc", "Stellar secret key starting with S...")}
            </Text>
          </View>
          <ChevronLeft
            size={18}
            color="#6b7280"
            style={{ transform: [{ rotate: "180deg" }] }}
          />
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════════════════════════════
  // IMPORT FORM (mnemonic or secret key)
  // ═══════════════════════════════════════
  if (mode === "import") {
    const isSecretKeyMode = mnemonicInput === "__SECRET_KEY_MODE__";

    // Reset the flag on first render
    if (isSecretKeyMode && mnemonicInput === "__SECRET_KEY_MODE__") {
      // This will only render once, then user types
    }

    return (
      <ScrollView style={s.formContainer} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={goBack}>
          <Text style={s.backText}>← {t("common.back", "Back")}</Text>
        </TouchableOpacity>

        <Text style={s.formTitle}>
          {isSecretKeyMode
            ? t("onboarding.importSecretKey", "Import Secret Key")
            : t("onboarding.recoverMnemonic", "Recover from Phrase")}
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("onboarding.walletName", "Wallet name")}
          placeholderTextColor="#6b7280"
          style={s.input}
        />
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder={t("onboarding.enterPin", "PIN (min 6 characters)")}
          placeholderTextColor="#6b7280"
          secureTextEntry
          style={s.input}
        />

        {isSecretKeyMode ? (
          <TextInput
            value={secret}
            onChangeText={setSecret}
            placeholder={t("onboarding.secretKey", "Secret key (S...)")}
            placeholderTextColor="#6b7280"
            multiline
            style={[s.input, { height: 80, textAlignVertical: "top" }]}
          />
        ) : (
          <>
            <Text style={s.label}>
              {t("onboarding.enterPhrase", "Recovery Phrase (12 or 24 words)")}
            </Text>
            <TextInput
              value={mnemonicInput === "__SECRET_KEY_MODE__" ? "" : mnemonicInput}
              onChangeText={(v) => setMnemonicInput(v.toLowerCase())}
              placeholder={t(
                "onboarding.phrasePlaceholder",
                "Enter your recovery phrase, words separated by spaces..."
              )}
              placeholderTextColor="#6b7280"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.input, { height: 120, textAlignVertical: "top" }]}
            />
            <Text style={s.hint}>
              {(() => {
                const wc = (mnemonicInput || "")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean).length;
                return `${wc}/24 ${t("onboarding.words", "words")}`;
              })()}
            </Text>
          </>
        )}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity
          onPress={isSecretKeyMode ? handleImportSecret : handleImportMnemonic}
          disabled={loading}
          style={[s.primaryBtn, loading && { opacity: 0.5 }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {t("onboarding.import", "Import")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ═══════════════════════════════════════
  // CREATE — Step 1: Name + PIN
  // ═══════════════════════════════════════
  if (mode === "create") {
    return (
      <View style={s.formContainer}>
        <TouchableOpacity onPress={goBack}>
          <Text style={s.backText}>
            ← {hasExisting ? t("common.back", "Back") : t("common.back", "Back")}
          </Text>
        </TouchableOpacity>

        <Text style={s.formTitle}>
          {t("onboarding.createWallet", "Create New Wallet")}
        </Text>
        {hasExisting && (
          <Text style={s.formSubtitle}>
            {t("accounts.addingNew", "Adding wallet")} ({accounts.length}{" "}
            {t("accounts.existing", "existing")})
          </Text>
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("onboarding.walletName", "Wallet name")}
          placeholderTextColor="#6b7280"
          style={s.input}
        />
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder={t("onboarding.enterPin", "PIN (min 6 characters)")}
          placeholderTextColor="#6b7280"
          secureTextEntry
          style={s.input}
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity onPress={handleCreateStep1} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>
            {t("onboarding.continue", "Continue")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════════════════════════════
  // BACKUP — Step 2: Show 24 words
  // ═══════════════════════════════════════
  if (mode === "backup") {
    return (
      <ScrollView style={s.formContainer} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity onPress={goBack}>
          <Text style={s.backText}>← {t("common.back", "Back")}</Text>
        </TouchableOpacity>

        <Text style={s.formTitle}>
          {t("onboarding.backupTitle", "Backup Recovery Phrase")}
        </Text>

        {/* Warning banner */}
        <View style={s.warningBox}>
          <AlertTriangle size={18} color="#f59e0b" />
          <Text style={s.warningText}>
            {t(
              "onboarding.backupWarning",
              "Write down these 24 words in order and store them safely. Anyone with this phrase can access your funds. Never share it."
            )}
          </Text>
        </View>

        {/* Word grid */}
        <View style={s.wordGrid}>
          {mnemonicWords.map((word, i) => (
            <View key={i} style={s.wordCell}>
              <Text style={s.wordIndex}>{i + 1}</Text>
              <Text style={s.wordText}>{word}</Text>
            </View>
          ))}
        </View>

        {/* Copy button */}
        <TouchableOpacity onPress={copyMnemonic} style={s.copyBtn}>
          {copied ? (
            <>
              <CheckCircle2 size={16} color="#10b981" />
              <Text style={[s.copyBtnText, { color: "#10b981" }]}>
                {t("common.copied", "Copied!")}
              </Text>
            </>
          ) : (
            <>
              <Copy size={16} color="#8b5cf6" />
              <Text style={s.copyBtnText}>
                {t("onboarding.copyPhrase", "Copy to clipboard")}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleBackupDone} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>
            {t("onboarding.iSavedIt", "I've saved my recovery phrase")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ═══════════════════════════════════════
  // VERIFY — Step 3: Confirm 3 random words
  // ═══════════════════════════════════════
  if (mode === "verify") {
    return (
      <ScrollView style={s.formContainer} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity onPress={goBack}>
          <Text style={s.backText}>← {t("common.back", "Back")}</Text>
        </TouchableOpacity>

        <Text style={s.formTitle}>
          {t("onboarding.verifyTitle", "Verify Recovery Phrase")}
        </Text>
        <Text style={s.formSubtitle}>
          {t(
            "onboarding.verifyDesc",
            "Enter the words at the positions shown below to confirm your backup."
          )}
        </Text>

        {verifyIndices.map((idx) => (
          <View key={idx} style={{ marginBottom: 16 }}>
            <Text style={s.label}>
              {t("onboarding.wordN", "Word #{{n}}", { n: idx + 1 })}
            </Text>
            <TextInput
              value={verifyAnswers[idx] || ""}
              onChangeText={(v) =>
                setVerifyAnswers((prev) => ({
                  ...prev,
                  [idx]: v.toLowerCase().trim(),
                }))
              }
              placeholder={`${t("onboarding.enterWord", "Enter word")} #${idx + 1}`}
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />
          </View>
        ))}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity
          onPress={handleVerifyAndCreate}
          disabled={loading}
          style={[s.primaryBtn, loading && { opacity: 0.5 }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {t("onboarding.verifyCreate", "Verify & Create Wallet")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSkipVerification}
          style={s.textBtn}
        >
          <Text style={s.textBtnText}>
            {t("onboarding.skipVerify", "Skip verification (not recommended)")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

// ═══════════════════════════════════════
// Styles
// ═══════════════════════════════════════
const s = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: "#0a0e1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  formContainer: {
    flex: 1,
    backgroundColor: "#0a0e1a",
    padding: 24,
    paddingTop: 60,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#3b82f6",
    marginBottom: 24,
  },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: {
    color: "#6b7280",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
  },
  formTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 8,
  },
  formSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 20,
  },
  backText: { color: "#6b7280", fontSize: 14, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    width: "100%",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 14,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    marginTop: 12,
  },
  outlineBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  input: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    color: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    marginBottom: 12,
  },
  label: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  hint: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: -8,
    marginBottom: 12,
  },
  error: { color: "#ef4444", fontSize: 13, marginBottom: 12 },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    padding: 14,
    marginVertical: 16,
  },
  warningText: {
    flex: 1,
    color: "#f59e0b",
    fontSize: 13,
    lineHeight: 20,
  },
  wordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  wordCell: {
    width: "31%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1f2937",
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  wordIndex: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "700",
    minWidth: 18,
  },
  wordText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    marginBottom: 4,
  },
  copyBtnText: { color: "#8b5cf6", fontSize: 13, fontWeight: "600" },
  textBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  textBtnText: { color: "#6b7280", fontSize: 12 },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 18,
    marginBottom: 12,
  },
  choiceTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  choiceDesc: { color: "#6b7280", fontSize: 12 },
});
