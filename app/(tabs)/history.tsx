import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionCard } from "../../components/SessionCard";
import { listSessions } from "../../lib/storage";
import type { LearningSession } from "../../shared/types";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listSessions();
    setSessions(all);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 pb-16"
        contentContainerStyle={{ paddingTop: insets.top + 20 }}
        ListHeaderComponent={
          <Text className="mb-4 text-2xl font-bold text-gray-900">Learning history</Text>
        }
        ListEmptyComponent={
          loaded ? (
            <Text className="mt-10 text-center text-gray-500">
              No sessions yet. Ask a question on the Home tab.
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <SessionCard session={item} onPress={() => router.push(`/explanation/${item.id}`)} />
        )}
      />
    </View>
  );
}
