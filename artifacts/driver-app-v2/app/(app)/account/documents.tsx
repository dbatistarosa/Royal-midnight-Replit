import { useState } from "react";
import { Alert, Linking, Modal, Pressable, Text, TextInput, View, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useAuthStore } from "@/auth/store";
import { useDriverDocuments, usePostDriverDocument, useSignPrivateObject } from "@/api/hooks";
import { privateObjectUrl, requestUploadUrl, uploadFileToPresignedUrl } from "@/api/driverApi";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";
import Constants from "expo-constants";
import { parseDateOnly } from "@/domain/earnings";

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
  if (days <= 30) return colors.warning;
  return colors.success;
}

function daysUntilExpiry(expiry: string | undefined): number | null {
  if (!expiry) return null;
  const date = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((date.getTime() - current) / 86_400_000);
}

function isValidDate(val: string): boolean {
  return parseDateOnly(val) !== null;
}

export default function DocumentsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const { data: docs, isLoading, isError, refetch } = useDriverDocuments(driverId);
  const postDocument = usePostDriverDocument(driverId ?? 0);
  const signPrivateObject = useSignPrivateObject();
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ uri: string; contentType: string } | null>(null);

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

    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      Alert.alert("Document picker unavailable", "The document was not uploaded.");
      return;
    }
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const contentType = (asset.mimeType ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
      Alert.alert("Unsupported document", "Choose a JPG, PNG, WebP, GIF, AVIF image, or PDF file.");
      return;
    }
    setUploadingType(docType);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(
        asset.name ?? `${docType}.${contentType === "application/pdf" ? "pdf" : "jpg"}`,
        asset.size ?? 0,
        contentType,
      );
      await uploadFileToPresignedUrl(uploadURL, asset.uri, contentType);
      await postDocument.mutateAsync({ docType, fileUrl: objectPath, contentType, newExpiry: expiry });
      setExpiry(docType, "");
      await refetch();
      Alert.alert("Submitted", "Your document was submitted for review.");
    } catch {
      Alert.alert("Upload failed", "Please try again.");
    } finally {
      setUploadingType(null);
    }
  }

  async function handleViewSubmission(submission: NonNullable<typeof docs>["submissions"][number]) {
    if (!docUrl(submission.fileUrl)) {
      Alert.alert("Document unavailable", "This document path is no longer valid.");
      return;
    }
    try {
      const signed = await signPrivateObject.mutateAsync(submission.fileUrl);
      const uri = privateObjectUrl(signed.path);
      if (submission.contentType === "application/pdf") {
        if (!(await Linking.canOpenURL(uri))) throw new Error("No PDF viewer");
        await Linking.openURL(uri);
        return;
      }
      setViewer({ uri, contentType: submission.contentType });
    } catch {
      Alert.alert("Document unavailable", "The document could not be opened. Try again later.");
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="pt-4">
          {isError ? <Card className="mb-5 border-danger"><Text className="text-danger text-sm mb-3">We couldn't load your documents. Check your connection and try again.</Text><Pressable onPress={() => void refetch()}><Text className="text-gold text-sm">Try again</Text></Pressable></Card> : null}
          {isLoading ? <Card className="mb-5"><Text className="text-muted text-sm">Loading your documents…</Text></Card> : null}
          {docs?.complianceHold ? (
            <Card className="mb-5 border-warning">
              <Text className="text-warning text-sm">
                At least one document has expired. You can't accept new rides until a renewal is approved.
              </Text>
            </Card>
          ) : null}

          {DOC_TYPES.map((docType) => {
            const expiry = docs?.currentExpiries[docType];
            const latestSubmission = docs?.submissions
              .filter((s) => s.docType === docType)
              .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
            const rejectedSubmission = latestSubmission?.status === "rejected" ? latestSubmission : undefined;
            const daysRemaining = daysUntilExpiry(expiry);
            const pendingReview = latestSubmission?.status === "pending_review";

            return (
              <Card key={docType} className="mb-3">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-white font-sans-medium">{docType}</Text>
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(expiry) }} />
                </View>
                <Text className="text-muted text-xs mb-3">
                  {expiry
                    ? daysRemaining != null && daysRemaining < 0
                      ? `Expired ${new Date(`${expiry}T00:00:00Z`).toLocaleDateString()}`
                      : daysRemaining != null && daysRemaining <= 30
                        ? `Expires ${new Date(`${expiry}T00:00:00Z`).toLocaleDateString()} · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
                        : `Expires ${new Date(`${expiry}T00:00:00Z`).toLocaleDateString()}`
                    : "No expiry on file"}
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
                    <Text className={latestSubmission.status === "pending_review" ? "text-warning text-xs" : latestSubmission.status === "approved" ? "text-success text-xs" : "text-danger text-xs"}>
                      {latestSubmission.status === "pending_review" ? "Pending review" : latestSubmission.status === "approved" ? "Approved" : "Rejected"} · {new Date(latestSubmission.submittedAt).toLocaleDateString()}
                    </Text>
                    {latestSubmission.fileUrl ? (
                      <Pressable onPress={() => void handleViewSubmission(latestSubmission)} className="flex-row items-center gap-1" disabled={signPrivateObject.isPending}>
                        <Ionicons name="eye-outline" size={14} color={colors.gold} />
                        <Text className="text-xs" style={{ color: colors.gold }}>{latestSubmission.contentType === "application/pdf" ? "Open PDF" : "View"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {pendingReview ? (
                  <Text className="text-warning text-xs mb-3">A newer upload is awaiting administrator review. Wait for the decision before uploading another version.</Text>
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
                  label={pendingReview ? "Awaiting Review" : latestSubmission ? "Upload New Version" : "Upload Document"}
                  variant="outline"
                  onPress={() => handleUpload(docType)}
                  loading={uploadingType === docType}
                  disabled={pendingReview}
                />
              </Card>
            );
          })}
        </View>
      </ScrollView>

      {/* Image viewer modal; PDFs open through the signed URL in the device PDF viewer. */}
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" }}>
          <Pressable
            style={{ position: "absolute", top: 48, right: 20, zIndex: 10, padding: 8 }}
            onPress={() => setViewer(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {viewer ? (
            <Image
              source={{
                uri: viewer.uri,
              }}
              style={{ width: "90%", height: "70%", resizeMode: "contain" }}
            />
          ) : null}
        </View>
      </Modal>
    </ScreenContainer>
  );
}
