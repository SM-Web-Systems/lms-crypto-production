import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react-native";

const API_BASE = "https://ammawallet.com";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(t("auth.emailRequired"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.successBox}>
          <CheckCircle size={48} color="#22c55e" />
          <Text style={styles.successTitle}>{t("auth.resetEmailSent")}</Text>
          <Text style={styles.successText}>{t("auth.resetEmailSentDesc")}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.btnText}>{t("auth.backToLogin")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{t("auth.forgotPassword")}</Text>
        <Text style={styles.subtitle}>{t("auth.forgotPasswordDesc")}</Text>

        <View style={styles.inputWrapper}>
          <Mail size={20} color="#6b7280" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={t("auth.emailPlaceholder")}
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{t("auth.sendResetLink")}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.linkText}>{t("auth.backToLogin")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { paddingTop: 56, paddingHorizontal: 16 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#9ca3af", fontSize: 15, marginBottom: 32, lineHeight: 22 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 14 },
  error: { color: "#ef4444", fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkBtn: { alignItems: "center", marginTop: 20 },
  linkText: { color: "#8b5cf6", fontSize: 14, fontWeight: "600" },
  successBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  successTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 12,
  },
  successText: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
});
