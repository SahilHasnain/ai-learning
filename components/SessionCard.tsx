import { Pressable, Text, View } from "react-native";
import type { LearningSession } from "../shared/types";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-emerald-100 text-emerald-700",
  intermediate: "bg-amber-100 text-amber-700",
  advanced: "bg-rose-100 text-rose-700",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface Props {
  session: LearningSession;
  onPress: () => void;
}

export function SessionCard({ session, onPress }: Props) {
  const score = session.quiz?.completed ? session.quiz.score : undefined;
  const total = session.quiz?.total;

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text numberOfLines={2} className="flex-1 text-base font-semibold text-gray-900">
          {session.topic || session.question}
        </Text>
        <Text className="text-xs text-gray-400">{formatDate(session.updatedAt)}</Text>
      </View>
      <View className="mt-2 flex-row items-center gap-2">
        <Text
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[session.difficulty] ?? "bg-gray-100 text-gray-600"}`}
        >
          {session.difficulty}
        </Text>
        {typeof score === "number" && total ? (
          <Text className="text-xs text-gray-500">
            Quiz: {score}/{total}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
