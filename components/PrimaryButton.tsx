import { ActivityIndicator, Pressable, Text } from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: Props) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center rounded-xl px-4 py-3 ${
        isPrimary ? "bg-indigo-600" : "border border-gray-300 bg-white"
      } ${disabled || loading ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#ffffff" : "#374151"} />
      ) : (
        <Text
          className={`text-base font-semibold ${
            isPrimary ? "text-white" : "text-gray-800"
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
