import { Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { GoldButton } from "@/components/GoldButton";

export default function ComplianceHoldScreen() {
  return (
    <ScreenContainer scroll={false}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="font-serif text-2xl text-warning text-center mb-3">Account On Hold</Text>
        <Text className="text-muted text-center text-sm leading-6 mb-10">
          One or more of your compliance documents has expired. You can't accept new rides until you upload a
          renewal and it's reviewed by our team.
        </Text>
        <GoldButton label="Update Documents" onPress={() => router.push("/(app)/account/documents")} />
      </View>
    </ScreenContainer>
  );
}
