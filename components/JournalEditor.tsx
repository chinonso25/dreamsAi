import { View, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { ThemedText } from "./ThemedText";
import styled from "styled-components/native";
import { useState } from "react";
import { formatDate } from "@/util";
import { FontAwesome6 } from "@expo/vector-icons";

const today = new Date();

type Props = {
  openBottomSheet: () => void;
};

export default function JournalEditor({ openBottomSheet }: Props) {
  const [text, setText] = useState("");
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, paddingHorizontal: 16 }}
    >
      <ThemedText type="subtitle">{formatDate(today)}</ThemedText>
      <ThemedText type="link">What did you dream?</ThemedText>
      <View style={{ flex: 1 }}>
        <EditorInput
          onChangeText={(text) => {
            setText(text);
          }}
          multiline
          placeholder="Write your dream here..."
        />
      </View>
      {/* <Divider /> */}

      <ToolBar>
        {!text && (
          <SaveButton onPress={openBottomSheet}>
            <Icon name={"microphone"} size={20} color="black" />
            <ThemedText type="defaultSemiBold">Record</ThemedText>
          </SaveButton>
        )}
        <SaveButton>
          <Icon name={"save"} size={20} color="black" />
          <ThemedText type="defaultSemiBold">Save</ThemedText>
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

const SaveButton = styled.TouchableOpacity({
  padding: 8,
  borderRadius: 8,
  borderColor: "#e5e5e5",
  borderWidth: 2,
  alignSelf: "stretch",
  alignItems: "center",
  flex: 1,
  width: "100%",
  marginHorizontal: 4,
  flexDirection: "row",
  justifyContent: "center",
});

const Icon = styled(FontAwesome6)`
  margin-right: 8px;
`;
