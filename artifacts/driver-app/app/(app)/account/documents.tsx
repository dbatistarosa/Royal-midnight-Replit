import { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "@/auth/store";
import { useDriverDocuments, usePostDriverDocument } from "@/api/hooks";
import { requestUploadUrl, uploadFileToPresignedUrl } from "@/api/driverApi";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";

const DOC_TYPES = ["Driver License", "Vehicle Registration", "Insurance"] as const;

function statusColor(expiry: string | undefined): string {
  if (!expiry) return colors.muted;
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return colors.danger;
  if (days < 14) return colors.warning;
  return colors.success;
}

export default function DocumentsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const { data: docs, refetch } = useDriverDocuments(driverId);
  const postDocument = usePostDriverDocument(driverId ?? 0);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  async function handleUpload(docType: string) {
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
      await postDocument.mutateAsync({ docType, fileUrl: objectPath });
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

          return (
            <Card key={docType} className="mb-3">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white font-sans-medium">{docType}</Text>
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(expiry) }} />
              </View>
              <Text className="text-muted text-xs mb-3">
                {expiry ? `Expires ${new Date(expiry).toLocaleDateString()}` : "No expiry on file"}
              </Text>
              {latestSubmission ? (
                <Text className="text-warning text-xs mb-2">Pending review since {new Date(latestSubmission.submittedAt).toLocaleDateString()}</Text>
              ) : null}
              <GoldButton
                label="Upload Renewal"
                variant="outline"
                onPress={() => handleUpload(docType)}
                loading={uploadingType === docType}
              />
            </Card>
          );
        })}
      </View>
    </ScreenContainer>
  );
}
