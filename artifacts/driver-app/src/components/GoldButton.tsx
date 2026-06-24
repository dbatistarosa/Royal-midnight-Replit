import { ActivityIndicator, Pressable, Text } from "react-native";
import { colors } from "@/theme/colors";

interface GoldButtonProps {
  label: string;
  onPress: () => void;
  variant?: "filled" | "outline" | "danger";
  loading?: boolean;
  disabled?: boolean;
}

export function GoldButton({ label, onPress, variant = "filled", loading, disabled }: GoldButtonProps) {
  const isDisabled = disabled || loading;

  const baseClass = "w-full items-center justify-center rounded-md py-4 px-6";
  const variantClass =
    variant === "filled"
      ? "bg-gold"
      : variant === "danger"
        ? "border border-danger"
        : "border border-gold";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${baseClass} ${variantClass} ${isDisabled ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "filled" ? colors.background : colors.gold} />
      ) : (
        <Text
          className={`text-sm font-sans-medium tracking-wide uppercase ${
            variant === "filled" ? "text-background" : variant === "danger" ? "text-danger" : "text-gold"
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
