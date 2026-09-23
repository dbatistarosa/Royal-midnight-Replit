import { Text, View } from "react-native";
import { useAuthStore } from "@/auth/store";
import { ScreenContainer } from "@/components/ScreenContainer";
import { GoldButton } from "@/components/GoldButton";

export default function PendingScreen() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <ScreenContainer scroll={false}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="font-serif text-2xl text-gold text-center mb-3">Application Under Review</Text>
        <Text className="text-muted text-center text-sm leading-6 mb-10">
          Thanks for applying to drive with Royal Midnight. Our team typically reviews new applications within
          1-2 business days. We'll notify you by email once a decision has been made.
        </Text>
        <GoldButton label="Log Out" variant="outline" onPress={logout} />
      </View>
    </ScreenContainer>
  );
}
