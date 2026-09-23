import { type ReactElement, type ReactNode } from "react";
import { ScrollView, View, type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  refreshControl?: ReactElement<RefreshControlProps>;
}

export function ScreenContainer({ children, scroll = true, className, refreshControl }: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          className={`flex-1 px-5 ${className ?? ""}`}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 px-5 ${className ?? ""}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
