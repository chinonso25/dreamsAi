import { View, ActivityIndicator, Pressable } from "react-native";
import { ThemedText } from "./ThemedText";

export const LoadingScreen = () => {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color="#0000ff" />
      <ThemedText style={{ marginTop: 16 }}>Loading your dreams...</ThemedText>
    </View>
  );
};

export const ErrorScreen = ({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) => {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <ThemedText
        type="subtitle"
        style={{ marginBottom: 8, textAlign: "center" }}
      >
        Oops! Something went wrong
      </ThemedText>
      <ThemedText style={{ textAlign: "center", marginBottom: 16 }}>
        {error.message}
      </ThemedText>
      {retry && (
        <Pressable
          onPress={retry}
          style={{
            backgroundColor: "#0000ff",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
          }}
        >
          <ThemedText style={{ color: "white" }}>Try Again</ThemedText>
        </Pressable>
      )}
    </View>
  );
};
