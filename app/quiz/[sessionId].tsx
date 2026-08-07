import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { describeError, generateQuiz } from "../../lib/api";
import { getSession, saveSession } from "../../lib/storage";
import { getUserId } from "../../lib/user";
import type { Difficulty, LearningSession, Quiz } from "../../shared/types";

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [session, setSession] = useState<LearningSession | undefined>();
  const [quiz, setQuiz] = useState<Quiz | undefined>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);

  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const found = await getSession(sessionId);
    setSession(found);
    if (found?.quiz && found.quiz.questions.length > 0) {
      setQuiz(found.quiz);
      if (found.quiz.completed) {
        setFinished(true);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerate(fresh = false) {
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setError(null);
    try {
      const difficulty = session.difficulty as Difficulty;
      const explanation = session.explanations[session.language]?.[difficulty];
      if (!explanation) {
        setError("No explanation available for this level yet. Go back and load it first.");
        return;
      }
      const userId = await getUserId();
      const response = await generateQuiz(
        session.question,
        difficulty,
        session.language,
        explanation,
        userId,
      );
      const nextQuiz: Quiz = { questions: response.quiz.questions };
      const updated: LearningSession = { ...session, quiz: nextQuiz };
      await saveSession(updated);
      setSession(updated);
      setQuiz(nextQuiz);
      setCurrentIndex(0);
      setSelected(null);
      setAnswered(false);
      setAnswers({});
      setFinished(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setGenerating(false);
      busyRef.current = false;
    }
  }

  function selectAnswer(index: number) {
    if (answered || !quiz) return;
    setSelected(index);
    setAnswered(true);
  }

  function handleNext() {
    if (!quiz) return;
    const current = quiz.questions[currentIndex];
    setAnswers((prev) => ({ ...prev, [current.id]: selected ?? -1 }));

    if (currentIndex + 1 < quiz.questions.length) {
      setCurrentIndex(currentIndex + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      finish(selected ?? -1);
    }
  }

  async function finish(lastSelected: number) {
    if (!quiz || !session) return;
    const current = quiz.questions[currentIndex];
    const allAnswers = { ...answers, [current.id]: lastSelected };
    const score = quiz.questions.reduce(
      (sum, q) => (allAnswers[q.id] === q.correctIndex ? sum + 1 : sum),
      0,
    );
    const completedQuiz: Quiz = {
      ...quiz,
      score,
      total: quiz.questions.length,
      completed: true,
      completedAt: new Date().toISOString(),
    };
    const updated: LearningSession = { ...session, quiz: completedQuiz };
    await saveSession(updated);
    setSession(updated);
    setQuiz(completedQuiz);
    setFinished(true);
  }

  function retry() {
    setCurrentIndex(0);
    setSelected(null);
    setAnswered(false);
    setAnswers({});
    setFinished(false);
  }

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#4f46e5" />
      </View>
    );
  }

  if (generating) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-8">
        <ActivityIndicator color="#4f46e5" />
        <Text className="mt-3 text-center text-sm text-gray-500">
          Writing questions based on the explanation…
        </Text>
      </View>
    );
  }

  if (!quiz) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-8">
        <Text className="text-center text-base text-gray-600">
          {error ?? "This session has no quiz yet."}
        </Text>
        {!error ? (
          <View className="mt-5 w-56">
            <PrimaryButton label="Generate quiz" onPress={() => handleGenerate(true)} />
          </View>
        ) : (
          <View className="mt-5 w-56">
            <PrimaryButton label="Go back" onPress={() => router.back()} />
          </View>
        )}
      </View>
    );
  }

  if (finished) {
    const score = quiz.score ?? 0;
    const total = quiz.total ?? quiz.questions.length;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    return (
      <View className="flex-1 justify-center bg-gray-50 p-8">
        <Text className="text-center text-5xl font-bold text-gray-900">
          {score}/{total}
        </Text>
        <Text className="mt-2 text-center text-lg text-gray-600">
          {percent >= 80
            ? "Nice work! You've got it."
            : percent >= 50
              ? "Good start. Review and try again."
              : "Review the explanation and try again."}
        </Text>
        <View className="mt-8 gap-3">
          <PrimaryButton label="Retry quiz" onPress={retry} />
          <PrimaryButton
            label="New questions"
            variant="secondary"
            onPress={() => handleGenerate(true)}
          />
          <PrimaryButton
            label="Back to explanation"
            variant="secondary"
            onPress={() => router.replace(`/explanation/${session.id}`)}
          />
        </View>
      </View>
    );
  }

  const question = quiz.questions[currentIndex];
  if (!question) return null;
  const progress = quiz.questions.length;
  const isLast = currentIndex + 1 >= progress;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="flex-row items-center px-5" style={{ paddingTop: insets.top + 12 }}>
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-1"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={18} color="#4f46e5" />
          <Text className="text-sm font-medium text-indigo-600">Back</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        <Text className="text-sm font-medium text-gray-400">
          Question {currentIndex + 1} of {progress}
        </Text>
        <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <View
            className="h-full rounded-full bg-indigo-600"
            style={{ width: `${((currentIndex + 1) / progress) * 100}%` }}
          />
        </View>

        <Text className="mt-5 text-xl font-semibold leading-7 text-gray-900">
          {question.prompt}
        </Text>

        <View className="mt-5 gap-3">
          {question.choices.map((choice, index) => {
            const isSelected = selected === index;
            const isCorrect = answered && index === question.correctIndex;
            const isWrong = answered && isSelected && index !== question.correctIndex;
            return (
              <Pressable
                key={index}
                onPress={() => selectAnswer(index)}
                disabled={answered}
                className={`rounded-xl border p-4 ${
                  isCorrect
                    ? "border-emerald-500 bg-emerald-50"
                    : isWrong
                      ? "border-rose-500 bg-rose-50"
                      : isSelected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 bg-white"
                }`}
              >
                <Text className="text-base text-gray-800">{choice}</Text>
              </Pressable>
            );
          })}
        </View>

        {answered ? (
          <View className="mt-5 rounded-xl bg-gray-100 p-4">
            <Text className="text-sm font-semibold text-gray-800">
              {selected === question.correctIndex ? "Correct" : "Not quite"}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-gray-600">
              {question.explanation}
            </Text>
          </View>
        ) : null}

        {error ? <Text className="mt-3 text-sm text-rose-600">{error}</Text> : null}
      </ScrollView>

      {answered ? (
        <View className="border-t border-gray-200 bg-white p-4 pb-8">
          <PrimaryButton
            label={isLast ? "See my score" : "Next question"}
            onPress={handleNext}
          />
        </View>
      ) : null}
    </View>
  );
}
