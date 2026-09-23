import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { useSupportTickets } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", closed: "Closed" };

export default function SupportListScreen() {
  const { data: tickets } = useSupportTickets();

  return (
    <ScreenContainer>
      <View className="pt-4 pb-4">
        <GoldButton label="New Ticket" onPress={() => router.push("/(app)/account/support/new")} />
      </View>

      {!tickets || tickets.length === 0 ? (
        <Text className="text-muted text-sm">No support tickets yet.</Text>
      ) : (
        <View className="gap-3">
          {tickets.map((ticket) => (
            <Pressable key={ticket.id} onPress={() => router.push(`/(app)/account/support/${ticket.id}`)}>
              <Card>
                <View className="flex-row justify-between items-start mb-1">
                  <Text className="text-white text-sm flex-1 pr-2">{ticket.subject}</Text>
                  <Text className="text-gold text-[11px] uppercase">{STATUS_LABEL[ticket.status]}</Text>
                </View>
                <Text className="text-muted text-xs">{format(new Date(ticket.createdAt), "MMM d, yyyy")}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
