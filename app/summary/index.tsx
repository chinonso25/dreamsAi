import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useRecordingStore } from "@/store";
import { processDreamTranscription } from "@/util/processDream";
import { transcribeAudio } from "@/util/transcribeAudio";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SafeAreaView, ScrollView, View } from "react-native";
import styled from "styled-components/native";
import { Journal } from "@/types";
import { formatDate } from "@/util";
import { supabase } from "@/util/supabase";
import { useAuth } from "@/contexts/AuthProvider";
import * as FileSystem from "expo-file-system";

export default function Screen() {
  const currentRecordingUri = useRecordingStore(
    (state) => state.currentRecordingUri
  );
  const { user } = useAuth();
  const { id: userId } = user || {};

  const uploadDreamAudio = async (): Promise<string | null> => {
    if (!currentRecordingUri || !userId) return null;

    try {
      const fileName = currentRecordingUri.split("/").pop();
      if (!fileName) return null;

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(currentRecordingUri);
      if (!fileInfo.exists) {
        console.error("File does not exist");
        return null;
      }

      // Read file as Base64
      const base64Content = await FileSystem.readAsStringAsync(
        currentRecordingUri,
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      // Convert Base64 to Uint8Array (one-liner)
      const bytes = Uint8Array.from(atob(base64Content), (char) =>
        char.charCodeAt(0)
      );

      // Upload to Supabase
      const { error } = await supabase.storage
        .from("dreams")
        .upload(`${userId}/${fileName}`, bytes, {
          upsert: true,
          contentType: "audio/m4a",
        });

      if (error) {
        console.error("Error uploading file:", error);
        return null;
      }

      // Get and return public URL
      const { data: publicID } = supabase.storage
        .from("dreams")
        .getPublicUrl(`${userId}/${fileName}`);

      return publicID?.publicUrl ?? null;
    } catch (error) {
      console.error("Failed to upload audio to Supabase:", error);
      return null;
    }
  };

  const { mutateAsync: uploadDreamToSupabase } = useMutation({
    mutationFn: async (resp: Partial<Journal>) => {
      const url = await uploadDreamAudio();

      const { data, error } = await supabase
        .from("dreams")
        .insert([{ ...resp, user_id: user?.id, audio_url: url }])
        .select();
    },
    mutationKey: ["uploadDream"],
  });

  const {
    data: dreamResponse,
    isLoading: dreamLoading,
    error: dreamError,
  } = useQuery({
    queryKey: ["transcribeDream", currentRecordingUri],
    queryFn: async (): Promise<Journal | undefined> => {
      try {
        if (currentRecordingUri) {
          const transcribedText = await transcribeAudio(currentRecordingUri);
          const trans = await processDreamTranscription(transcribedText);
          const journ: Partial<Journal> = {
            ...trans,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_starred: false,
            user_id: user?.id ? parseInt(user.id) : undefined,
          };

          try {
            await uploadDreamToSupabase(journ);
          } catch (error) {
            console.error("Failed to upload dream to Supabase:", error);
          }

          return journ as Journal;
        }
      } catch (error) {
        console.log("Failed to transcribe dream:", error);
      }
      return undefined;
    },
    enabled: Boolean(currentRecordingUri),
  });

  const { title, transcript, created_at, summary, tags, keywords } =
    dreamResponse || {};
  if (dreamLoading || dreamError) return null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={{ flex: 1, padding: 16, backgroundColor: "#eee" }}>
        <Header>
          <View>
            <ShareButton>
              <Feather name="share" size={24} color="#7e57c2" />
            </ShareButton>
          </View>
          <Spacer />
          <ThemedText type="title">{title}</ThemedText>
          <Spacer />
          <ThemedText type="caption">
            {created_at ? formatDate(new Date(created_at)) : ""}
          </ThemedText>
        </Header>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <TextBox>
            <ThemedText type="subtitle">Summary</ThemedText>
            <ThemedText>{summary}</ThemedText>
          </TextBox>
          <TextBox>
            <ThemedText type="subtitle">Transcription</ThemedText>
            <ThemedText>{transcript}</ThemedText>
          </TextBox>

          <ThemedText type="subtitle">Tags</ThemedText>
          <TagsWrapper>
            {tags?.map((tag) => (
              <TagContainer key={tag}>
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: "white", fontSize: 14 }}
                >
                  {tag}
                </ThemedText>
              </TagContainer>
            ))}
          </TagsWrapper>

          <ThemedText type="subtitle">Keywords</ThemedText>
          <TagsWrapper>
            {keywords?.map((word) => (
              <TagContainer key={word}>
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: "white", fontSize: 14 }}
                >
                  {word}
                </ThemedText>
              </TagContainer>
            ))}
          </TagsWrapper>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const Header = styled.View({
  paddingTop: 32,
});

const TextBox = styled.View({
  backgroundColor: "white",
  padding: 16,
  borderRadius: 8,
  marginVertical: 16,
});

const Spacer = styled.View({
  height: 16,
});

const TagsWrapper = styled.View({
  flexDirection: "row",
  marginVertical: 8,
});

const TagContainer = styled.View({
  padding: 8,
  backgroundColor: "#7e57c2",
  borderRadius: 24,
  marginHorizontal: 4,
});

const ShareButton = styled.TouchableOpacity({
  alignSelf: "flex-end",
});
