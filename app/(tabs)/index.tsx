import { View, SafeAreaView, Pressable, ScrollView } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/util/supabase";
import { useAuth } from "@/contexts/AuthProvider";
import { formatDate } from "@/util";
import { MasonryFlashList } from "@shopify/flash-list";
import { Journal } from "@/types";
import {
  LoadingScreen,
  ErrorScreen,
} from "@/components/LoadingAndErrorScreens";

const renderNote = ({ item }: { item: Journal }) => {
  const { title, summary, keywords, created_at } = item;

  return (
    <Pressable
      style={{
        padding: 16,
        backgroundColor: "#f5f5f5",
        margin: 8,
        borderRadius: 16,
      }}
      onPress={() => {
        router.push(`/Dream/${item.id}`);
      }}
    >
      <ThemedText type="caption">{formatDate(created_at)}</ThemedText>
      <ThemedText type="subtitle" style={{ fontSize: 18 }}>
        {title}
      </ThemedText>
      <ScrollView horizontal>
        {keywords?.map((keyword) => (
          <View
            key={keyword}
            style={{
              marginRight: 4,
              marginVertical: 8,
              padding: 4,
              backgroundColor: "#e5e5e5",
              borderRadius: 8,
            }}
          >
            <ThemedText type="caption">{keyword}</ThemedText>
          </View>
        ))}
      </ScrollView>
      <ThemedText numberOfLines={4} ellipsizeMode="tail">
        {summary}
      </ThemedText>
    </Pressable>
  );
};

export default function HomeScreen() {
  const { user } = useAuth();

  const {
    data: dreams,
    isLoading,
    error,
    refetch,
  } = useQuery<Journal[]>({
    queryKey: ["dreams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dreams")
        .select()
        .eq("user_id", user?.id);
      if (error) throw error;
      return data as Journal[];
    },
    enabled: Boolean(user?.id),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error as Error} retry={refetch} />;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 8, backgroundColor: "white" }}>
        <MasonryFlashList
          data={dreams}
          numColumns={2}
          renderItem={renderNote}
          estimatedItemSize={400}
        />
      </View>
    </SafeAreaView>
  );
}
