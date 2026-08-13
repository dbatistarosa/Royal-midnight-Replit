import { useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/auth/store";
import { useDriverDocuments, usePostDriverDocument } from "@/api/hooks";
import { requestUploadUrl, uploadFileToPresignedUrl } from "@/api/driverApi";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";
import Constants from "expo-constants";

const DOC_TYPES = ["Driver License", "Vehicle Registration", "Insurance"] as const;

const API_BASE = (Constants.expoConfig?.extra?.["apiBaseUrl"] as string | undefined) ?? "https://royalmidnight.com/api";

/** Build the download URL for a private object.
 *
 *  A stored fileUrl is user-supplied, so an absolute URL is never followed —
 *  only the key inside our own object storage is used (CN-041). The route now
 *  requires authentication (CN-003); unlike a browser, React Native's <Image>
 *  can send headers, so the bearer token is attached at the call site rather
 *  than needing a signed URL. */
function docUrl(path: string): string | null {
  const key = path
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^api\/storage\/objects\//, "")
    .replace(/^storage\/objects\//, "")
    .replace(/^objects\//, "");
  if (!key || key.includes("..")) return null;
  return `${API_BASE}/storage/objects/${key}`;
}

function statusColor(expiry: string | undefined): string {
  if (!expiry) return colors.muted;
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return colors.danger;
  if (days < 14) return colors.warning;
  return colors.success;
}

function isValidDate(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(new Date(val).getTime());
}

export default function DocumentsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const authToken = useAuthStore((s) => s.token);
  const { data: docs, refetch } = useDriverDocuments(driverId);
  const postDocument = usePostDriverDocument(driverId ?? 0);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  function setExpiry(docType: string, val: string) {
    setExpiryInputs(prev => ({ ...prev, [docType]: val }));
  }

  async function handleUpload(docType: string) {
    const expiry = expiryInputs[docType]?.trim();
    if (!expiry) {
      Alert.alert("Expiry date required", "Please enter the expiration date before uploading.");
      return;
    }
    if (!isValidDate(expiry)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD format (e.g. 2027-05-15).");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingType(docType);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(
        asset.fileName ?? `${docType}.jpg`,
        asset.fileSize ?? 0,
        asset.mimeType ?? "image/jpeg",
      );
      await uploadFileToPresignedUrl(uploadURL, asset.uri, asset.mimeType ?? "image/jpeg");
      await postDocument.mutateAsync({ docType, fileUrl: objectPath, newExpiry: expiry });
      setExpiry(docType, "");
      refetch();
      Alert.alert("Submitted", "Your document was submitted for review.");
    } catch {
      Alert.alert("Upload failed", "Please try again.");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="pt-4">
          {docs?.complianceHold ? (
            <Card className="mb-5 border-warning">
              <Text className="text-warning text-sm">
                At least one document has expired. You can't accept new rides until a renewal is approved.
              </Text>
            </Card>
          ) : null}

          {DOC_TYPES.map((docType) => {
            const expiry = docs?.currentExpiries[docType];
            const latestSubmission = docs?.submissions.find((s) => s.docType === docType && s.status === "pending_review");
            const rejectedSubmission = docs?.submissions.find((s) => s.docType === docType && s.status === "rejected");
            const approvedSubmission = docs?.submissions.find((s) => s.docType === docType && s.status === "approved");
            const viewableSubmission = latestSubmission ?? approvedSubmission;

            return (
              <Card key={docType} className="mb-3">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-white font-sans-medium">{docType}</Text>
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(expiry) }} />
                </View>
                <Text className="text-muted text-xs mb-3">
                  {expiry ? `Expires ${new Date(expiry).toLocaleDateString()}` : "No expiry on file"}
                </Text>

                {rejectedSubmission ? (
                  <View className="mb-3 p-2.5 rounded" style={{ backgroundColor: colors.danger + "20", borderWidth: 1, borderColor: colors.danger + "40" }}>
                    <Text className="text-xs" style={{ color: colors.danger }}>
                      Last upload was rejected
                      {rejectedSubmission.adminNotes ? `: ${rejectedSubmission.adminNotes}` : ""}
                    </Text>
                    <Text className="text-xs text-muted mt-1">Please re-upload a valid document.</Text>
                  </View>
                ) : null}

                {latestSubmission ? (
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-warning text-xs">
                      Pending review since {new Date(latestSubmission.submittedAt).toLocaleDateString()}
                    </Text>
                    {viewableSubmission?.fileUrl ? (
                      <Pressable onPress={() => setViewImageUrl(docUrl(viewableSubmission.fileUrl))} className="flex-row items-center gap-1">
                        <Ionicons name="eye-outline" size={14} color={colors.gold} />
                        <Text className="text-xs" style={{ color: colors.gold }}>View</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Expiry date input — required before upload */}
                <View className="mb-3">
                  <Text className="text-muted text-xs mb-1">
                    Document expiry date <Text style={{ color: colors.danger }}>*</Text>
                  </Text>
                  <TextInput
                    value={expiryInputs[docType] ?? ""}
                    onChangeText={val => setExpiry(docType, val)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border ?? "#333",
                      color: colors.white,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 14,
                      borderRadius: 4,
                    }}
                  />
                </View>

                <GoldButton
                  label={latestSubmission ? "Upload New Version" : "Upload Document"}
                  variant="outline"
                  onPress={() => handleUpload(docType)}
                  loading={uploadingType === docType}
                />
              </Card>
            );
          })}
        </View>
      </ScrollView>

      {/* Image viewer modal */}
      <Modal visible={viewImageUrl !== null} transparent animationType="fade" onRequestClose={() => setViewImageUrl(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" }}>
          <Pressable
            style={{ position: "absolute", top: 48, right: 20, zIndex: 10, padding: 8 }}
            onPress={() => setViewImageUrl(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {viewImageUrl ? (
            <Image
              source={{
                uri: viewImageUrl,
                // The private object route requires a session (CN-003).
                ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
              }}
              style={{ width: "90%", height: "70%", resizeMode: "contain" }}
            />
          ) : null}
        </View>
      </Modal>
    </ScreenContainer>
  );
}
