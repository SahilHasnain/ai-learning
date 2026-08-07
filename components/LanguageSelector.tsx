import { Pressable, Text, View } from "react-native";
import { LANGUAGES, type ExplanationLanguage } from "../shared/types";

const LABELS: Record<ExplanationLanguage, string> = {
  english: "English",
  hinglish: "Hinglish",
};

interface Props {
  value: ExplanationLanguage;
  onChange: (language: ExplanationLanguage) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function LanguageSelector({ value, onChange, disabled, compact }: Props) {
  return (
    <View className={`flex-row ${compact ? "gap-1" : "gap-2"}`}>
      {LANGUAGES.map((language) => {
        const selected = language === value;
        return (
          <Pressable
            key={language}
            disabled={disabled}
            onPress={() => onChange(language)}
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
              {LABELS[language]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
