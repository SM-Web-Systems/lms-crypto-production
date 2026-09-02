import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";

interface PinModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => Promise<void>;
  title?: string;
}

export default function PinModal({ visible, onClose, onConfirm, title }: PinModalProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (pin.length < 6) {
      setError(t("onboarding.pinMin", "PIN must be at least 6 characters"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(pin);
      setPin("");
      onClose();
    } catch (e: any) {
      setError(e.message || t("pin.invalid", "Invalid PIN"));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPin("");
    setError("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#111827", borderRadius: 16, borderWidth: 1, borderColor: "#1f2937", padding: 20, gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
              {title || t("pin.confirm", "Confirm PIN")}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder={t("onboarding.enterPin", "Enter PIN")}
            placeholderTextColor="#6b7280"
            secureTextEntry
            autoFocus
            style={{
              backgroundColor: "#0a0e1a",
              borderWidth: 1,
              borderColor: "#1f2937",
              borderRadius: 12,
              color: "#fff",
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
            }}
          />

          {error ? <Text style={{ color: "#ef4444", fontSize: 13 }}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleConfirm}
            disabled={loading}
            style={{
              backgroundColor: "#3b82f6",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
                {t("common.confirm", "Confirm")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}