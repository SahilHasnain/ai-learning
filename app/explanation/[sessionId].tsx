import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DifficultySelector } from "../../components/DifficultySelector";
import { PrimaryButton } from "../../components/PrimaryButton";
import { describeError, explainQuestion } from "../../lib/api";
import { getSession, saveSession } from "../../lib/storage";
import { getUserId } from "../../lib/user";
import type { Difficulty, Explanation, LearningSession } from "../../shared/types";

function SectionBlock({ heading, body }: { heading: string; body: string }) {
  return (
    <View className="mt-4">
      <Text className="text-lg font-semibold text-gray-900">{heading}</Text>
      <Text className="mt-1 text-base leading-6 text-gray-700">{body}</Text>
    </View>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="text-lg font-semibold text-gray-900">{title}</Text>
      {items.map((item, index) => (
        <Text key={index} className="mt-1 text-base leading-6 text-gray-700">
          {index + 1}. {item}
        </Text>
      ))}
    </View>
  );
}

export default function ExplanationScreen() {
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<LearningSession | undefined>();
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const found = await getSession(sessionId);
    setSession(found);
    if (found) {
      setDifficulty(found.difficulty);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const explanation: Explanation | undefined =
    session?.explanations[session.language]?.[difficulty];

  async function handleChangeDifficulty(next: Difficulty) {
    if (!session) return;
    setDifficulty(next);
    const cached = session.explanations[session.language]?.[next];
    if (cached) {
      setError(null);
      await saveSession({ ...session, difficulty: next });
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const userId = await getUserId();
      const response = await explainQuestion(
        session.question,
        next,
        session.language,
        userId,
      );
      const updated: LearningSession = {
        ...session,
        difficulty: next,
        topic: response.explanation.topic,
        explanations: {
          ...session.explanations,
          [session.language]: {
            ...session.explanations[session.language],
            [next]: response.explanation,
          },
        },
      };
      await saveSession(updated);
      setSession(updated);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setGenerating(false);
    }
  }

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="px-5 pb-16"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
    >
      <Pressable
        onPress={() => router.back()}
        className="mb-3 flex-row items-center gap-1 self-start"
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={18} color="#4f46e5" />
        <Text className="text-sm font-medium text-indigo-600">Back</Text>
      </Pressable>

      <Text className="text-xs font-medium uppercase tracking-wide text-indigo-600">
        {session.question}
      </Text>
      <Text className="mt-1 text-2xl font-bold text-gray-900">
        {session.topic}
      </Text>

      <View className="mt-4">
        <Text className="mb-2 text-sm font-medium text-gray-700">
          Explanation level
        </Text>
        <DifficultySelector
          value={difficulty}
          onChange={handleChangeDifficulty}
          disabled={generating}
        />
      </View>

      {generating ? (
        <View className="mt-8 items-center">
          <ActivityIndicator color="#4f46e5" />
          <Text className="mt-3 text-sm text-gray-500">Explaining this level…</Text>
        </View>
      ) : explanation ? (
        <>
          {error ? <Text className="mt-3 text-sm text-rose-600">{error}</Text> : null}
          {explanation.sections.map((section, index) => (
            <SectionBlock key={index} heading={section.heading} body={section.body} />
          ))}
          {explanation.analogy ? (
            <View className="mt-4 rounded-xl bg-indigo-50 p-4">
              <Text className="text-sm font-semibold text-indigo-900">
                Think of it like…
              </Text>
              <Text className="mt-1 text-base text-indigo-800">{explanation.analogy}</Text>
            </View>
          ) : null}
          <ListBlock title="Examples" items={explanation.examples} />
          <ListBlock title="Key points" items={explanation.keyPoints} />

          <View className="mt-8">
            <PrimaryButton
              label={session.quiz ? "Take the quiz again" : "Quiz me"}
              onPress={() => router.push(`/quiz/${session.id}`)}
            />
          </View>
        </>
      ) : error ? (
        <Text className="mt-6 text-sm text-rose-600">{error}</Text>
      ) : null}
    </ScrollView>
  );
}
