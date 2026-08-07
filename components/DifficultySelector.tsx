import { Pressable, Text, View } from "react-native";
import { DIFFICULTIES, type Difficulty } from "../shared/types";

const LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const COMPACT_LABELS: Record<Difficulty, string> = {
  beginner: "Easy",
  intermediate: "Medium",
  advanced: "Hard",
};

interface Props {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function DifficultySelector({ value, onChange, disabled, compact }: Props) {
  const labels = compact ? COMPACT_LABELS : LABELS;
  return (
    <View className={`flex-row ${compact ? "gap-1" : "gap-2"}`}>
      {DIFFICULTIES.map((difficulty) => {
        const selected = difficulty === value;
        return (
          <Pressable
            key={difficulty}
            disabled={disabled}
            onPress={() => onChange(difficulty)}
            className={`flex-1 rounded-full border ${
              compact ? "px-1 py-1.5" : "px-3 py-2"
            } ${
              selected
                ? "border-indigo-600 bg-indigo-600"
                : "border-gray-300 bg-white"
            }`}
          >
            <Text
              numberOfLines={1}
              className={`text-center font-medium ${
                compact ? "text-[11px]" : "text-sm"
              } ${
                selected ? "text-white" : "text-gray-700"
              }`}
            >
              {labels[difficulty]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
