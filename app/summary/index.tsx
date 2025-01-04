import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useRecordingStore } from "@/store";
import { processDreamTranscription } from "@/util/processDream";
import { transcribeAudio } from "@/util/transcribeAudio";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView, ScrollView, View, Alert } from "react-native";
import styled from "styled-components/native";
import { Journal } from "@/types";
import { formatDate } from "@/util";
import { supabase } from "@/util/supabase";
import { useAuth } from "@/contexts/AuthProvider";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ErrorScreen } from "@/components/LoadingAndErrorScreens";
import { LoadingScreen } from "@/components/LoadingAndErrorScreens";

export default function Screen() {
  const currentRecordingUri = useRecordingStore(
    (state) => state.currentRecordingUri
  );
  const { user } = useAuth();
  const { id: userId } = user || {};
  const router = useRouter();
  const { dreamData } = useLocalSearchParams<{ dreamData?: string }>();
  const queryClient = useQueryClient();

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

  const {
    mutateAsync: uploadDreamToSupabase,
    isPending: uploadDreamPending,
    isError: uploadDreamError,
  } = useMutation({
    mutationFn: async (resp: Partial<Journal>) => {
      const url = currentRecordingUri ? await uploadDreamAudio() : null;

      const { data, error } = await supabase
        .from("dreams")
        .insert([{ ...resp, user_id: user?.id, audio_url: url }])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dreams"] });

      Alert.alert("Success", "Dream saved successfully!");
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to save dream. Please try again.");
      console.error(error);
    },
    mutationKey: ["uploadDream"],
  });

  const {
    data: dreamResponse,
    isLoading: dreamLoading,
    error: dreamError,
  } = useQuery({
    queryKey: ["transcribeDream", currentRecordingUri, dreamData],
    queryFn: async (): Promise<Journal | undefined> => {
      try {
        if (dreamData) {
          // If we have dream data from text input, parse and return it
          return JSON.parse(dreamData) as Journal;
        } else if (currentRecordingUri) {
          // Handle audio recording
          const transcribedText = await transcribeAudio(currentRecordingUri);
          const trans = await processDreamTranscription(transcribedText);
          return {
            ...trans,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_starred: false,
            user_id: user?.id ? parseInt(user.id) : undefined,
          } as Journal;
        }
      } catch (error) {
        console.log("Failed to process dream:", error);
        throw error;
      }
      return undefined;
    },
    enabled: Boolean(currentRecordingUri) || Boolean(dreamData),
  });

  const { title, transcript, created_at, summary, tags, keywords } =
    dreamResponse || {};
  if (dreamLoading || dreamError) return null;

  if (uploadDreamPending || dreamLoading) return <LoadingScreen />;
  if (uploadDreamError || dreamError)
    return <ErrorScreen error={uploadDreamError || dreamError} />;

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
          {/* <TagsWrapper>
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
          </TagsWrapper> */}

          <SaveButton
            onPress={() =>
              dreamResponse && uploadDreamToSupabase(dreamResponse)
            }
            disabled={uploadDreamPending}
          >
            <ThemedText type="defaultSemiBold" style={{ color: "white" }}>
              Save Dream
            </ThemedText>
          </SaveButton>
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
  flexWrap: "wrap",
});

const TagContainer = styled.View({
  padding: 8,
  backgroundColor: "#7e57c2",
  borderRadius: 24,
  marginHorizontal: 4,
  marginVertical: 4,
});

const ShareButton = styled.TouchableOpacity({
  alignSelf: "flex-end",
});

const SaveButton = styled.TouchableOpacity({
  backgroundColor: "#7e57c2",
  padding: 16,
  borderRadius: 8,
  alignItems: "center",
  marginTop: 24,
});
