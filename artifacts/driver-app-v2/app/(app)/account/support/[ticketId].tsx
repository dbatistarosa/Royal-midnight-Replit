import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import { useAuthStore } from "@/auth/store";
import { useTicketMessages, usePostTicketMessage } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";

export default function TicketThreadScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const id = Number(ticketId);
  const userId = useAuthStore((s) => s.user?.id);
  const { data: messages } = useTicketMessages(id);
  const postMessage = usePostTicketMessage(id);
  const [reply, setReply] = useState("");

  async function handleSend() {
    if (!reply.trim()) return;
    try {
      await postMessage.mutateAsync(reply.trim());
      setReply("");
    } catch {
      Alert.alert("Couldn't send", "Please check your connection and try again.");
    }
  }

  return (
    <ScreenContainer>
      <View className="pt-4 gap-3">
        {(messages ?? []).map((msg) => {
          const isMine = msg.userId === userId;
          return (
            <Card key={msg.id} className={isMine ? "border-gold" : ""}>
              <Text className="text-[11px] uppercase text-muted mb-1">
                {msg.authorRole === "admin" ? "Royal Midnight Support" : "You"} · {format(new Date(msg.createdAt), "MMM d, h:mm a")}
              </Text>
              <Text className="text-white text-sm">{msg.message}</Text>
            </Card>
          );
        })}

        <View className="flex-row gap-2 mt-2">
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="Type a reply…"
            placeholderTextColor="#9ca3af"
            className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-white"
          />
        </View>
        <GoldButton label="Send" onPress={handleSend} loading={postMessage.isPending} disabled={!reply.trim()} />
      </View>
    </ScreenContainer>
  );
}
