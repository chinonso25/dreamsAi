import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function OnboardingLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="features" />
        <Stack.Screen name="permissions" />
        <Stack.Screen name="tutorial" />
        <Stack.Screen name="final" />
      </Stack>
    </>
  );
}
