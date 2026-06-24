import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCreateSupportTicket } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { GoldButton } from "@/components/GoldButton";

export default function NewTicketScreen() {
  const createTicket = useCreateSupportTicket();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    const ticket = await createTicket.mutateAsync({ subject, description });
    router.replace(`/(app)/account/support/${ticket.id}`);
  }

  return (
    <ScreenContainer>
      <View className="pt-4 gap-3">
        <View>
          <Text className="text-xs uppercase tracking-wide text-muted mb-1">Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholderTextColor="#9ca3af"
            className="rounded-md border border-border bg-surface px-4 py-3 text-white"
          />
        </View>
        <View>
          <Text className="text-xs uppercase tracking-wide text-muted mb-1">Describe the issue</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            placeholderTextColor="#9ca3af"
            className="rounded-md border border-border bg-surface px-4 py-3 text-white"
            style={{ minHeight: 120, textAlignVertical: "top" }}
          />
        </View>
        <GoldButton
          label="Submit"
          onPress={handleSubmit}
          loading={createTicket.isPending}
          disabled={!subject.trim() || !description.trim()}
        />
      </View>
    </ScreenContainer>
  );
}
