import { View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { ThemedText } from "./ThemedText";
import styled from "styled-components/native";
import { useState } from "react";
import { formatDate } from "@/util";
import { FontAwesome6 } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import { processDreamTranscription } from "@/util/processDream";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Journal, JournalResponse } from "@/types";
import { ErrorScreen } from "./LoadingAndErrorScreens";
import { LoadingScreen } from "./LoadingAndErrorScreens";

const today = new Date();

type Props = {
  openBottomSheet: () => void;
};

export default function JournalEditor({ openBottomSheet }: Props) {
  const [text, setText] = useState("");
  const { user } = useAuth();
  const router = useRouter();

  const processDreamMutation = useMutation<JournalResponse, Error, string>({
    mutationFn: async (text: string) => {
      try {
        const processedDream = await processDreamTranscription(text);
        return processedDream;
      } catch (error) {
        console.error("Failed to process dream:", error);
        throw error;
      }
    },
    onSuccess: (processedDream) => {
      router.dismissAll();
      router.push({
        pathname: "/summary",
        params: {
          dreamData: JSON.stringify({
            ...processedDream,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_starred: false,
            user_id: user?.id,
          }),
        },
      });
    },
    onError: (error: Error) => {
      Alert.alert("Error", "Failed to process dream. Please try again.");
      console.error(error);
    },
  });

  const handleSave = async () => {
    if (!text.trim()) {
      Alert.alert("Error", "Please enter your dream before saving.");
      return;
    }
    processDreamMutation.mutate(text);
  };

  if (processDreamMutation.isPending) return <LoadingScreen />;
  if (processDreamMutation.isError)
    return <ErrorScreen error={processDreamMutation.error} />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, paddingHorizontal: 16 }}
    >
      <ThemedText type="subtitle">{formatDate(today)}</ThemedText>
      <ThemedText type="link">What did you dream?</ThemedText>
      <View style={{ flex: 1 }}>
        <EditorInput
          onChangeText={(text: string) => {
            setText(text);
          }}
          value={text}
          multiline
          placeholder="Write your dream here..."
        />
      </View>

      <ToolBar>
        {!text && (
          <SaveButton onPress={openBottomSheet}>
            <Icon name={"microphone"} size={20} color="black" />
            <ThemedText type="defaultSemiBold">Record</ThemedText>
          </SaveButton>
        )}
        <SaveButton
          onPress={handleSave}
          disabled={!text.trim() || processDreamMutation.isPending}
        >
          <Icon
            name={"save"}
            size={20}
            color={text.trim() ? "black" : "#999"}
          />
          <ThemedText
            type="defaultSemiBold"
            style={{ color: text.trim() ? "black" : "#999" }}
          >
            Continue
          </ThemedText>
        </SaveButton>
      </ToolBar>
    </KeyboardAvoidingView>
  );
}

const EditorInput = styled.TextInput({
  width: "100%",
  fontSize: 20,
  paddingVertical: 16,
  height: "100%",
  fontFamily: "Outfit_400Regular",
});

const ToolBar = styled.View({
  justifyContent: "space-between",
  flexDirection: "row",
  marginVertical: 16,
});

const SaveButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: 8px;
  border-radius: 8px;
  border-color: #e5e5e5;
  border-width: 2px;
  align-self: stretch;
  align-items: center;
  flex: 1;
  width: 100%;
  margin-horizontal: 4px;
  flex-direction: row;
  justify-content: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const Icon = styled(FontAwesome6)`
  margin-right: 8px;
`;
