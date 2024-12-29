import { Fontisto } from "@expo/vector-icons";
import { Stack, useNavigation } from "expo-router";
import { Button } from "react-native";

export default function Layout() {
  const { goBack } = useNavigation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerRight: () => (
            <Fontisto name="close-a" onPress={goBack} size={14} color="black" />
          ),
          title: "",
          headerStyle: { backgroundColor: "transparent" },
        }}
      />
    </Stack>
  );
}
