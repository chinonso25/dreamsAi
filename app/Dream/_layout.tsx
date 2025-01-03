import { ThemedText } from "@/components/ThemedText";
import { FontAwesome6 } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";

export default function Layout() {
  const { back } = useRouter();
  return (
    <ActionSheetProvider>
      <Stack>
        <Stack.Screen
          name="[id]"
          options={{
            headerLeft: () => (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center" }}
                onPress={back}
              >
                <FontAwesome6 name="chevron-left" size={14} color="black" />
                <ThemedText style={{ marginLeft: 4 }}>All Dreams</ThemedText>
              </Pressable>
            ),
            headerRight: () => (
              <Pressable
                style={{ padding: 8 }}
                onPress={() => {
                  // This will be handled in the detail screen
                  if (global.showDreamActions) {
                    global.showDreamActions();
                  }
                }}
              >
                <FontAwesome6 name="ellipsis" size={20} color="black" />
              </Pressable>
            ),
            headerTitle: "",
          }}
        />
      </Stack>
    </ActionSheetProvider>
  );
}
