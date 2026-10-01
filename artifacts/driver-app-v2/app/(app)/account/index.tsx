import { Alert, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useDriverByUserId, useDriverEarnings, usePatchDriverContact, useSignPrivateObject } from "@/api/hooks";
import { requestUploadUrl, uploadFileToPresignedUrl, privateObjectUrl } from "@/api/driverApi";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { colors } from "@/theme/colors";
import { ScreenTitle } from "@/components/DriverUI";
import { driverInitials, vehicleClassLabel } from "@/theme/driverPresentation";
import { needsPrivateSigning } from "@/domain/profileMedia";
import { GoldButton } from "@/components/GoldButton";

const MENU_ITEMS: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string; badge?: boolean }[] = [
  { label: "My Vehicle", icon: "car-sport", href: "/(app)/account/vehicle" },
  { label: "Documents", icon: "document-text", href: "/(app)/account/documents" },
  { label: "Payout & Banking", icon: "card", href: "/(app)/account/payout" },
  { label: "Support", icon: "help-circle", href: "/(app)/account/support" },
  { label: "Notifications", icon: "notifications", href: "/(app)/notifications" },
];

export default function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: driver } = useDriverByUserId(user?.id ?? null);
  const { data: earnings, isError: earningsError } = useDriverEarnings(driver?.id ?? null);
  const patchContact = usePatchDriverContact(driver?.id ?? 0);
  const signObject = useSignPrivateObject();
  const [profileUri, setProfileUri] = useState<string | null>(null);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const raw = driver?.profilePicture;
    if (!raw) {
      setProfileUri(null);
      setProfileImageFailed(false);
      return () => { active = false; };
    }
    if (!needsPrivateSigning(raw)) {
      setProfileUri(raw);
      setProfileImageFailed(false);
      return () => { active = false; };
    }
    void signObject.mutateAsync(raw).then((signed) => {
      if (active) {
        setProfileUri(privateObjectUrl(signed.path));
        setProfileImageFailed(false);
      }
    }).catch(() => {
      if (active) setProfileImageFailed(true);
    });
    return () => { active = false; };
  }, [driver?.profilePicture]);

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo permission needed", "Allow photo access in Settings to update your profile picture.");
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    } catch {
      Alert.alert("Photo picker unavailable", "Your current profile photo was kept.");
      return;
    }
    if (result.canceled || !result.assets[0] || !driver) return;
    const asset = result.assets[0];
    setPhotoBusy(true);
    try {
      const contentType = asset.mimeType ?? "image/jpeg";
      const upload = await requestUploadUrl(asset.fileName ?? "profile.jpg", asset.fileSize ?? 0, contentType);
      await uploadFileToPresignedUrl(upload.uploadURL, asset.uri, contentType);
      await patchContact.mutateAsync({ profilePicture: upload.objectPath });
      Alert.alert("Photo submitted", "Your new profile photo is waiting for administrator approval. The passenger portal will keep showing the approved photo until then.");
    } catch {
      Alert.alert("Photo upload failed", "Your current profile photo was kept.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const vehicleLabel = driver
    ? [driver.vehicleColor, driver.vehicleYear, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(" ")
    : "";
  const displayName = driver?.name || user?.name || "Royal Midnight Driver";

  return (
    <ScreenContainer>
      <ScreenTitle title="Profile" />
      <View className="flex-row items-center gap-5 pt-3 pb-7">
        {profileUri && !profileImageFailed ? (
          <Image source={{ uri: profileUri }} onError={() => setProfileImageFailed(true)} style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: colors.gold }} />
        ) : (
          <View className="rounded-full bg-surface items-center justify-center border-2 border-gold" style={{ width: 88, height: 88, borderRadius: 44 }}>
            <Text className="font-serif text-2xl text-gold">{driverInitials(displayName)}</Text>
          </View>
        )}
        <View className="flex-1"><Text className="font-sans-medium text-lg text-white">{displayName}</Text>
        {driver?.rating != null ? (
          <View className="flex-row items-center mt-1 gap-1">
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text className="text-white text-sm">{driver.rating.toFixed(2)}</Text>
          </View>
        ) : null}
        <Text className="text-muted text-xs mt-3">Professional Chauffeur</Text>
        <Text className="text-muted text-xs mt-1">{driver?.totalRides ?? 0} rides · Member since {driver?.createdAt ? new Date(driver.createdAt).getFullYear() : "—"}</Text></View>
      </View>

      <View className="flex-row gap-3 mb-4">
        <Pressable accessibilityRole="button" onPress={() => void choosePhoto()} disabled={photoBusy} className="flex-1 rounded-xl border border-gold bg-surface p-3 items-center justify-center"><Text className="text-gold text-xs">{photoBusy ? "Uploading…" : "Change Photo"}</Text></Pressable>
        <View className="flex-1"><Text className="text-[11px] uppercase text-muted mb-1">Phone</Text><View className="rounded-md border border-border bg-surface px-3 py-2"><Text className="text-white">{driver?.phone || "Not provided"}</Text></View></View>
      </View>

      {earningsError ? <Card className="mt-4 border-warning"><Text className="text-warning text-xs">Some performance data could not be refreshed. Pull down to retry.</Text></Card> : null}

      <Card className="my-5">
        <Text className="text-[11px] uppercase text-muted mb-2">Performance</Text>
        <View className="flex-row justify-between"><Text className="text-muted text-xs">Completed rides</Text><Text className="text-white text-sm">{earnings?.totalRides ?? driver?.totalRides ?? 0}</Text></View>
        <View className="flex-row justify-between mt-2"><Text className="text-muted text-xs">Average per ride</Text><Text className="text-white text-sm">${(earnings?.avgPerRide ?? 0).toFixed(2)}</Text></View>
        {driver?.rating != null ? <View className="border-t border-border mt-3 pt-3 flex-row items-center gap-1">{[1, 2, 3, 4, 5].map((star) => <Ionicons key={star} name={star <= Math.round(driver.rating ?? 0) ? "star" : "star-outline"} size={16} color={colors.gold} />)}<Text className="text-white text-sm ml-1">{driver.rating.toFixed(2)}</Text></View> : null}
      </Card>

      <Pressable accessibilityRole="button" accessibilityLabel="View my vehicle" onPress={() => router.push("/(app)/account/vehicle")}><Card className="mb-5 flex-row items-center gap-3">
        <Ionicons name="car-sport" size={38} color={colors.gold} />
        <View className="flex-1"><Text className="text-white font-sans-medium text-sm">{vehicleLabel || "Add your vehicle"}</Text><Text className="text-muted text-xs mt-1">{vehicleClassLabel(driver?.vehicleClass)}</Text></View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Card></Pressable>

      <View className="rounded-xl border border-border bg-surface overflow-hidden mb-5">
        {MENU_ITEMS.map((item) => (
          <Pressable accessibilityRole="button" key={item.label} onPress={() => router.push(item.href as never)}>
            <View className="flex-row items-center justify-between p-4 border-b border-border">
              <View className="flex-row items-center gap-3">
                <Ionicons name={item.icon} size={18} color={colors.gold} />
                <Text className="text-white text-sm">{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={() => { void logout(); router.replace("/(auth)/login"); }} className="rounded-xl border border-border bg-surface flex-row items-center gap-3 p-4">
        <Ionicons name="log-out-outline" size={22} color={colors.danger} /><Text className="text-danger font-sans-medium text-sm">Log Out</Text>
      </Pressable>
    </ScreenContainer>
  );
}
