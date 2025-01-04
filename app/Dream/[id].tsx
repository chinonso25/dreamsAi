import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/contexts/AuthProvider";
import { Journal } from "@/types";
import { formatDate } from "@/util";
import { supabase } from "@/util/supabase";
import { FontAwesome6 } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Share,
} from "react-native";
import { useActionSheet } from "@expo/react-native-action-sheet";
import styled from "styled-components/native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useState, useEffect } from "react";
import DreamAudioPlayer from "@/components/DreamAudioPlayer";

declare global {
  var showDreamActions: (() => void) | undefined;
}

export default function Dream() {
  const { user } = useAuth();
  const { id: dreamId } = useLocalSearchParams();
  const { invalidateQueries } = useQueryClient();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedTranscript, setEditedTranscript] = useState("");
  const [newTag, setNewTag] = useState("");
  const [editedKeywords, setEditedKeywords] = useState<string[]>([]);
  const { showActionSheetWithOptions } = useActionSheet();

  const {
    data: dream,
    isLoading,
    error,
  } = useQuery<Journal>({
    queryKey: ["dream", dreamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dreams")
        .select()
        .eq("user_id", user?.id)
        .eq("id", dreamId);

      if (error) throw error;
      return data?.[0] as Journal;
    },
    enabled: Boolean(user?.id) && Boolean(dreamId),
  });

  useEffect(() => {
    if (dream) {
      setEditedTitle(dream.title || "");
      setEditedTranscript(dream.transcript || "");
      setEditedKeywords(dream.keywords || []);
    }
  }, [dream]);

  const updateDreamMutation = useMutation({
    mutationFn: async (updatedDream: Partial<Journal>) => {
      const { data, error } = await supabase
        .from("dreams")
        .update(updatedDream)
        .eq("id", dreamId)
        .eq("user_id", user?.id);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateQueries({ queryKey: ["dream", dreamId] });
      invalidateQueries({ queryKey: ["dreams"] });
      setIsEditing(false);
      Alert.alert("Success", "Dream updated successfully");
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to update dream");
      console.error(error);
    },
  });

  const handleSave = () => {
    updateDreamMutation.mutate({
      title: editedTitle,
      transcript: editedTranscript,
      keywords: editedKeywords,
      updated_at: new Date().toISOString(),
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editedKeywords.includes(newTag.trim())) {
      setEditedKeywords([...editedKeywords, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditedKeywords(editedKeywords.filter((tag) => tag !== tagToRemove));
  };

  const player = useAudioPlayer(
    "https://clhdhfxpgdyhytgpyvvk.supabase.co/storage/v1/object/sign/dreams/81d8f772-694c-400a-91b5-ad525417af07/recording-D0C6EE5A-02B5-4A2E-B73B-F4460BD873BE.m4a?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJkcmVhbXMvODFkOGY3NzItNjk0Yy00MDBhLTkxYjUtYWQ1MjU0MTdhZjA3L3JlY29yZGluZy1EMEM2RUU1QS0wMkI1LTRBMkUtQjczQi1GNDQ2MEJEODczQkUubTRhIiwiaWF0IjoxNzM1MDk3MzYwLCJleHAiOjE3MzU3MDIxNjB9.-8Zz60kailT9dIy3cPOioGvDRvSBpXlfW7hB5jz37f8&t=2024-12-25T03%3A29%3A20.595Z"
  );

  const playerStatus = useAudioPlayerStatus(player);

  const deleteDreamMutation = useMutation({
    mutationFn: async () => {
      // First delete the audio file if it exists
      if (dream?.audio_url) {
        // Extract the file path from the URL
        const audioPath = dream.audio_url.split("/dreams/")[1]?.split("?")[0];
        if (audioPath) {
          const { error: storageError } = await supabase.storage
            .from("dreams")
            .remove([audioPath]);

          if (storageError) {
            console.error("Failed to delete audio file:", storageError);
          }
        }
      }

      // Then delete the dream record
      const { error } = await supabase
        .from("dreams")
        .delete()
        .eq("id", dreamId)
        .eq("user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries({ queryKey: ["dreams"] });
      router.back();
      Alert.alert("Success", "Dream deleted successfully");
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to delete dream");
      console.error(error);
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("dreams")
        .update({ is_starred: !dream?.is_starred })
        .eq("id", dreamId)
        .eq("user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries({ queryKey: ["dream", dreamId] });
      invalidateQueries({ queryKey: ["dreams"] });
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to update star status");
      console.error(error);
    },
  });

  const handleShare = async () => {
    try {
      await Share.share({
        title: dream?.title || "Dream",
        message: `${dream?.title}\n\n${dream?.transcript || ""}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const showActionSheet = () => {
    const options = [
      "Cancel",
      "Delete",
      "Share",
      dream?.is_starred ? "Remove Star" : "Star Dream",
    ];
    const destructiveButtonIndex = 1;
    const cancelButtonIndex = 0;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (selectedIndex) => {
        if (selectedIndex === 1) {
          Alert.alert(
            "Delete Dream",
            "Are you sure you want to delete this dream? This action cannot be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteDreamMutation.mutate(),
              },
            ]
          );
        } else if (selectedIndex === 2) {
          handleShare();
        } else if (selectedIndex === 3) {
          toggleFavoriteMutation.mutate();
        }
      }
    );
  };

  useEffect(() => {
    global.showDreamActions = showActionSheet;
    return () => {
      global.showDreamActions = undefined;
    };
  }, [dream?.is_starred]);

  if (error && isLoading) return null;

  const { title, keywords, created_at, transcript, audio_url } = dream || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <HeaderDivider />
      <HeaderContainer>
        {isEditing ? (
          <TextInput
            value={editedTitle}
            onChangeText={setEditedTitle}
            style={{
              fontSize: 24,
              fontFamily: "Outfit_600SemiBold",
              padding: 4,
              borderWidth: 1,
              borderColor: "#e5e5e5",
              borderRadius: 4,
              marginBottom: 8,
            }}
          />
        ) : (
          <ThemedText type="title" style={{ fontSize: 24 }}>
            {title}
          </ThemedText>
        )}
        <HeaderContentContainer>
          <ThemedText type="caption">Date</ThemedText>
          <View style={{ marginHorizontal: 8 }} />
          <ThemedText>{formatDate(created_at!)}</ThemedText>
        </HeaderContentContainer>

        <HeaderContentContainer>
          <ThemedText type="caption">Tags</ThemedText>
          {isEditing ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginLeft: 8,
              }}
            >
              <TextInput
                value={newTag}
                onChangeText={setNewTag}
                placeholder="Add tag"
                style={{
                  padding: 4,
                  borderWidth: 1,
                  borderColor: "#e5e5e5",
                  borderRadius: 4,
                  marginRight: 8,
                  minWidth: 100,
                }}
                onSubmitEditing={handleAddTag}
              />
              <TouchableOpacity onPress={handleAddTag}>
                <FontAwesome6 name="plus" size={20} color="black" />
              </TouchableOpacity>
            </View>
          ) : (
            <AddTagButton onPress={() => setIsEditing(true)}>
              <FontAwesome6 name="circle-plus" size={24} color="black" />
            </AddTagButton>
          )}
          <View style={{ marginHorizontal: 8 }} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(isEditing ? editedKeywords : keywords || []).map(
              (keyword: string) => (
                <TagContainer key={keyword}>
                  <Tag>{keyword}</Tag>
                  {isEditing && (
                    <TouchableOpacity
                      onPress={() => handleRemoveTag(keyword)}
                      style={{ marginLeft: 4 }}
                    >
                      <FontAwesome6 name="times" size={12} color="black" />
                    </TouchableOpacity>
                  )}
                </TagContainer>
              )
            )}
          </ScrollView>
        </HeaderContentContainer>
        {/* {audio_url && <DreamAudioPlayer audio_url={audio_url} />} */}
      </HeaderContainer>

      <ScrollView>
        <TextContainer>
          {isEditing ? (
            <TextInput
              value={editedTranscript}
              onChangeText={setEditedTranscript}
              multiline
              style={{
                fontFamily: "Outfit_400Regular",
                padding: 4,
                borderWidth: 1,
                borderColor: "#e5e5e5",
                borderRadius: 4,
                minHeight: 200,
              }}
            />
          ) : (
            <ThemedText>{transcript}</ThemedText>
          )}
        </TextContainer>
      </ScrollView>

      <ActionButtonContainer>
        {isEditing ? (
          <>
            <ActionButton onPress={handleSave}>
              <ThemedText style={{ color: "white" }}>Save</ThemedText>
            </ActionButton>
            <ActionButton
              onPress={() => setIsEditing(false)}
              style={{ backgroundColor: "#666" }}
            >
              <ThemedText style={{ color: "white" }}>Cancel</ThemedText>
            </ActionButton>
          </>
        ) : (
          <ActionButton onPress={() => setIsEditing(true)}>
            <ThemedText style={{ color: "white" }}>Edit</ThemedText>
          </ActionButton>
        )}
      </ActionButtonContainer>
    </SafeAreaView>
  );
}

const TextContainer = styled.View({
  padding: 16,
});

const HeaderContainer = styled.View({
  padding: 16,
  borderBottomWidth: 1,
  borderBottomColor: "#e5e5e5",
  borderTopWidth: 1,
  borderTopColor: "#e5e5e5",
});

const HeaderDivider = styled.View({
  flexDirection: "row",
  borderBottomWidth: 1,
  borderColor: "#e5e5e5",
});

const Tag = styled(ThemedText)`
  background-color: #f0f0f0;
  padding: 4px 8px;
  border-radius: 16px;
  margin-right: 8px;
`;

const AddTagButton = styled.Pressable({
  marginLeft: 8,
});

const HeaderContentContainer = styled.View({
  flexDirection: "row",
  alignItems: "center",
  marginVertical: 4,
});

const TagContainer = styled.View({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#f0f0f0",
  padding: 4,
  paddingHorizontal: 8,
  borderRadius: 16,
  marginRight: 8,
});

const ActionButtonContainer = styled.View({
  flexDirection: "row",
  justifyContent: "center",
  gap: 8,
  padding: 16,
  backgroundColor: "white",
  borderTopWidth: 1,
  borderTopColor: "#e5e5e5",
});

const ActionButton = styled.TouchableOpacity({
  backgroundColor: "black",
  paddingVertical: 8,
  paddingHorizontal: 16,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
  minWidth: 100,
});
