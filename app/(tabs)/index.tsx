import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DifficultySelector } from "../../components/DifficultySelector";
import { LanguageSelector } from "../../components/LanguageSelector";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SessionCard } from "../../components/SessionCard";
import { describeError, explainQuestion } from "../../lib/api";
import { createSession, listSessions, saveSession } from "../../lib/storage";
import { getUserId } from "../../lib/user";
import type {
  Difficulty,
  ExplanationLanguage,
  LearningSession,
} from "../../shared/types";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [language, setLanguage] = useState<ExplanationLanguage>("english");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<LearningSession[]>([]);

  const refreshRecent = useCallback(async () => {
    const sessions = await listSessions();
    setRecent(sessions.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshRecent();
    }, [refreshRecent]),
  );

  const canSubmit = question.trim().length > 0 && !loading;

  async function handleLearn() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = question.trim();
      const userId = await getUserId();
      const session = createSession({
        question: trimmed,
        topic: trimmed,
        difficulty,
        language,
      });

      const response = await explainQuestion(trimmed, difficulty, language, userId);
      const updated: LearningSession = {
        ...session,
        topic: response.explanation.topic,
        explanations: {
          ...session.explanations,
          [language]: {
            ...session.explanations[language],
            [difficulty]: response.explanation,
          },
        },
      };
      await saveSession(updated);

      router.push(`/explanation/${updated.id}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-50"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16"
        contentContainerStyle={{ paddingTop: insets.top + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-2 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
            <Text className="text-2xl">🤖</Text>
          </View>
          <View className="flex-1">
            <Text className="text-3xl font-bold text-gray-900">
              Understand any topic.
            </Text>
          </View>
        </View>
        <Text className="mt-1 text-base text-gray-600">
          Ask a question, get a clear explanation, and test yourself.
        </Text>

        <View className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about anything, e.g. how does a transformer work?"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={500}
            className="min-h-24 text-base text-gray-900"
          />
          <Text className="mt-1 self-end text-xs text-gray-400">
            {question.length}/500
          </Text>

          <View className="mt-4 flex-row items-stretch gap-3">
            <View className="flex-[3]">
              <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Level
              </Text>
              <DifficultySelector
                value={difficulty}
                onChange={setDifficulty}
                disabled={loading}
                compact
              />
            </View>
            <View className="w-px self-stretch bg-gray-200" />
            <View className="flex-[2]">
              <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Language
              </Text>
              <LanguageSelector
                value={language}
                onChange={setLanguage}
                disabled={loading}
                compact
              />
            </View>
          </View>

          <View className="mt-5">
            <PrimaryButton label="Learn" onPress={handleLearn} loading={loading} disabled={!canSubmit} />
          </View>

          {error ? (
            <Text className="mt-3 text-sm text-rose-600">{error}</Text>
          ) : null}
        </View>

        {recent.length > 0 ? (
          <View className="mt-8">
            <Text className="mb-3 text-lg font-semibold text-gray-900">
              Recent sessions
            </Text>
            <View className="gap-3">
              {recent.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onPress={() => router.push(`/explanation/${session.id}`)}
                />
              ))}
            </View>
            <Pressable onPress={() => router.push("/history")} className="mt-3">
              <Text className="text-center text-sm font-medium text-indigo-600">
                View all sessions
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
