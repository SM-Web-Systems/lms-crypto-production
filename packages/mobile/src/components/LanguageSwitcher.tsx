import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react-native";

const languages = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪" },
  { code: "af", name: "Afrikaans", flag: "🇿🇦" },
  { code: "zu", name: "isiZulu", flag: "🇿🇦" },
  { code: "xh", name: "isiXhosa", flag: "🇿🇦" },
  { code: "st", name: "Sesotho", flag: "🇿🇦" },
  { code: "tn", name: "Setswana", flag: "🇿🇦" },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const currentCode = i18n.language?.split("-")[0] || "en";

  const currentLang = languages.find((l) => l.code === currentCode) || languages[0];

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#0a0e1a",
          borderWidth: 1,
          borderColor: "#1f2937",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Globe size={16} color="#6b7280" />
          <Text style={{ color: "#fff", fontSize: 14 }}>
            {currentLang.flag} {currentLang.name}
          </Text>
        </View>
        <Text style={{ color: "#6b7280", fontSize: 12 }}>{t("common.change", "Change")}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              paddingBottom: 34,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#1f2937" }} />
            </View>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginBottom: 12 }}>
              {t("settings.language", "Language")}
            </Text>
            <ScrollView>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => {
                    i18n.changeLanguage(lang.code);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    backgroundColor: lang.code === currentCode ? "rgba(59,130,246,0.1)" : "transparent",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 15 }}>
                    {lang.flag}  {lang.name}
                  </Text>
                  {lang.code === currentCode && <Check size={18} color="#3b82f6" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}