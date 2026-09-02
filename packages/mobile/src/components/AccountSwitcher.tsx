import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../shared/store/wallet";
import * as Clipboard from "expo-clipboard";
import { ChevronDown, Plus, Download, Trash2, Pencil, Check, X, User, Copy } from "lucide-react-native";

export default function AccountSwitcher() {
  const { t } = useTranslation();
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const activeAccountId = useWalletStore((s) => s.activeAccountId);
  const switchAccount = useWalletStore((s) => s.switchAccount);
  const removeAccount = useWalletStore((s) => s.removeAccount);
  const renameAccount = useWalletStore((s) => s.renameAccount);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const active = accounts.find((a) => a.id === activeAccountId);

  const handleSwitch = (id: string) => {
    switchAccount(id);
    setOpen(false);
  };

  const startRename = (account: any) => {
    setEditingId(account.id);
    setEditName(account.name);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      renameAccount(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      t("accounts.delete", "Delete Wallet"),
      `${t("accounts.deleteConfirm", "Delete")} "${name}"?`,
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("common.delete", "Delete"),
          style: "destructive",
          onPress: () => {
            removeAccount(id);
            if (accounts.length <= 1) router.replace("/onboarding");
          },
        },
      ]
    );
  };

  const copyAddress = async (account: any) => {
    await Clipboard.setStringAsync(account.publicKey);
    setCopiedId(account.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(59,130,246,0.3)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <User size={14} color="#3b82f6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
            {active?.name || "No Wallet"}
          </Text>
          <Text style={{ color: "#6b7280", fontSize: 10, fontFamily: "monospace" }} numberOfLines={1}>
            {active?.publicKey ? `${active.publicKey.slice(0, 6)}...${active.publicKey.slice(-6)}` : ""}
          </Text>
        </View>
        <ChevronDown size={16} color="#6b7280" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start", paddingTop: 100 }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              marginHorizontal: 20,
              backgroundColor: "#111827",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#1f2937",
              overflow: "hidden",
            }}
          >
            <ScrollView style={{ maxHeight: 300 }}>
              {accounts.map((account) => (
                <View
                  key={account.id}
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: "#1f2937",
                    backgroundColor: account.id === activeAccountId ? "rgba(59,130,246,0.1)" : "transparent",
                  }}
                >
                  {editingId === account.id ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput
                        value={editName}
                        onChangeText={setEditName}
                        autoFocus
                        style={{
                          flex: 1,
                          backgroundColor: "#0a0e1a",
                          borderWidth: 1,
                          borderColor: "#1f2937",
                          borderRadius: 8,
                          color: "#fff",
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          fontSize: 13,
                        }}
                        onSubmitEditing={saveRename}
                      />
                      <TouchableOpacity onPress={saveRename}>
                        <Check size={16} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingId(null)}>
                        <X size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => handleSwitch(account.id)}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: account.id === activeAccountId ? "#3b82f6" : "rgba(255,255,255,0.1)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                            {account.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
                            {account.name}
                          </Text>
                          <Text style={{ color: "#6b7280", fontSize: 9, fontFamily: "monospace" }} numberOfLines={1}>
                            {account.publicKey.slice(0, 8)}...{account.publicKey.slice(-6)}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => copyAddress(account)} style={{ padding: 6 }}>
                        {copiedId === account.id ? (
                          <Check size={13} color="#10b981" />
                        ) : (
                          <Copy size={13} color="#6b7280" />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => startRename(account)} style={{ padding: 6 }}>
                        <Pencil size={13} color="#6b7280" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(account.id, account.name)} style={{ padding: 6 }}>
                        <Trash2 size={13} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: "#1f2937", padding: 10, gap: 4 }}>
              <TouchableOpacity
                onPress={() => { setOpen(false); router.push("/onboarding?action=create"); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 }}
              >
                <Plus size={14} color="#6b7280" />
                <Text style={{ color: "#6b7280", fontSize: 13 }}>
                  {t("accounts.create", "Create New Wallet")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setOpen(false); router.push("/onboarding?action=import"); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 }}
              >
                <Download size={14} color="#6b7280" />
                <Text style={{ color: "#6b7280", fontSize: 13 }}>
                  {t("accounts.import", "Import Wallet")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
