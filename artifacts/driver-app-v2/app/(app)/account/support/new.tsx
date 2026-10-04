import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCreateSupportTicket } from "@/api/hooks";
import { useAuthStore } from "@/auth/store";
import { ScreenContainer } from "@/components/ScreenContainer";
import { GoldButton } from "@/components/GoldButton";

export default function NewTicketScreen() {
  const user = useAuthStore((s) => s.user);
  const createTicket = useCreateSupportTicket();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit() {
    try {
      const ticket = await createTicket.mutateAsync({
        name: user?.name ?? "",
        email: user?.email ?? "",
        subject,
        message,
      });
      router.replace(`/(app)/account/support/${ticket.id}`);
    } catch {
      Alert.alert("Couldn't submit", "Please check your connection and try again.");
    }
  }

  return (
    <ScreenContainer>
      <View className="pt-4 gap-3">
        <View>
          <Text className="text-xs uppercase tracking-wide text-muted mb-1">Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief summary of the issue"
            placeholderTextColor="#9ca3af"
            className="rounded-md border border-border bg-surface px-4 py-3 text-white"
          />
        </View>
        <View>
          <Text className="text-xs uppercase tracking-wide text-muted mb-1">Describe the issue</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            placeholder="What happened? Include the trip or screen involved if relevant."
            placeholderTextColor="#9ca3af"
            className="rounded-md border border-border bg-surface px-4 py-3 text-white"
            style={{ minHeight: 120, textAlignVertical: "top" }}
          />
        </View>
        <GoldButton
          label="Submit"
          onPress={handleSubmit}
          loading={createTicket.isPending}
          disabled={!subject.trim() || !message.trim()}
        />
      </View>
    </ScreenContainer>
  );
}
