import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../src/shared/store/auth";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [twoFaMessage, setTwoFaMessage] = useState("");
  const [twoFaToken, setTwoFaToken] = useState("");

  const inputStyle = {
    backgroundColor: "#1e293b",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#334155",
  };

  const handleLogin = async () => {
    setError("");
    if (!identifier.trim() || !password) {
      setError(mode === "email" ? t("auth.emailRequired") : t("auth.phoneRequired", "Phone number is required"));
      return;
    }
    setLoading(true);
    try {
      const loginId = mode === "phone" ? identifier.trim() : identifier.trim();
      const res = await login(loginId, password, twoFaRequired ? twoFaToken : undefined);

      if (res?.twoFaRequired) {
        setTwoFaRequired(true);
        setTwoFaMessage(res.message);
        setLoading(false);
        return;
      }

      router.replace("/");
    } catch (e: any) {
      setError(e.message || t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 28, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 8 }}>
          {t("auth.welcomeBack")}
        </Text>
        <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 32 }}>
          {t("auth.loginSubtitle")}
        </Text>

        {error ? (
          <View style={{ backgroundColor: "#7f1d1d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: "#fca5a5", fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {!twoFaRequired ? (
          <>
            {/* Email / Phone toggle */}
            <View style={{ flexDirection: "row", backgroundColor: "#1e293b", borderRadius: 8, padding: 3, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => { setMode("email"); setIdentifier(""); }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 6,
                  alignItems: "center",
                  backgroundColor: mode === "email" ? "#6366f1" : "transparent",
                }}
              >
                <Text style={{ color: mode === "email" ? "#fff" : "#94a3b8", fontSize: 14, fontWeight: "600" }}>
                  {t("auth.email", "Email")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setMode("phone"); setIdentifier(""); }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 6,
                  alignItems: "center",
                  backgroundColor: mode === "phone" ? "#6366f1" : "transparent",
                }}
              >
                <Text style={{ color: mode === "phone" ? "#fff" : "#94a3b8", fontSize: 14, fontWeight: "600" }}>
                  {t("auth.phone", "Phone")}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>
              {mode === "email" ? t("auth.email") : t("auth.phone", "Phone Number")}
            </Text>
            <TextInput
              style={{ ...inputStyle, marginBottom: 16 }}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={mode === "email" ? t("auth.emailPlaceholder") : "+14155552671"}
              placeholderTextColor="#475569"
              keyboardType={mode === "email" ? "email-address" : "phone-pad"}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.password")}</Text>
            <TextInput
              style={{ ...inputStyle, marginBottom: 24 }}
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.passwordPlaceholder")}
              placeholderTextColor="#475569"
              secureTextEntry
            />
          </>
        ) : (
          <>
            <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", marginBottom: 16 }}>
              {twoFaMessage}
            </Text>
            <TextInput
              style={{ ...inputStyle, marginBottom: 24, textAlign: "center", letterSpacing: 4 }}
              value={twoFaToken}
              onChangeText={setTwoFaToken}
              placeholder={t("auth.twoFaCodePlaceholder", "Enter code")}
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              maxLength={8}
            />
          </>
        )}

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#4338ca" : "#6366f1",
            borderRadius: 8,
            padding: 16,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {twoFaRequired ? t("auth.verify", "Verify") : t("auth.login")}
            </Text>
          )}
        </TouchableOpacity>

        {!twoFaRequired && (
          <>
            <TouchableOpacity onPress={() => router.push("/forgot-password")}>
              <Text style={{ color: "#818cf8", fontSize: 14, textAlign: "center", marginBottom: 12 }}>
                {t("auth.forgotPassword")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/register")}>
              <Text style={{ color: "#818cf8", fontSize: 14, textAlign: "center" }}>
                {t("auth.noAccount")} <Text style={{ fontWeight: "600" }}>{t("auth.register")}</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
