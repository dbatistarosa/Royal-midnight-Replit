import { Text, View } from "react-native";
import { useAuthStore } from "@/auth/store";
import { useDriverByUserId } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { GoldButton } from "@/components/GoldButton";

export default function RejectedScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: driver } = useDriverByUserId(user?.id ?? null);

  return (
    <ScreenContainer scroll={false}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="font-serif text-2xl text-danger text-center mb-3">Application Not Approved</Text>
        {driver?.rejectionReason ? (
          <Text className="text-muted text-center text-sm leading-6 mb-10">{driver.rejectionReason}</Text>
        ) : (
          <Text className="text-muted text-center text-sm leading-6 mb-10">
            Your application was not approved at this time. Contact support@royalmidnight.com if you have questions.
          </Text>
        )}
        <GoldButton label="Log Out" variant="outline" onPress={logout} />
      </View>
    </ScreenContainer>
  );
}
