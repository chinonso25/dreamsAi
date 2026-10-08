import { useMotionPreference } from '@/components/motion/Motion';
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";

import {
  useFonts,
  Outfit_100Thin,
  Outfit_200ExtraLight,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from "@expo-google-fonts/outfit";
import { ContextWrapper } from "@/contexts/ContextWrappers";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    Outfit_100Thin,
    Outfit_200ExtraLight,
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  useEffect(() => {
    if (loaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [loaded, fontError]);

  if (!loaded && !fontError) {
    return null;
  }

  return (
    <ContextWrapper>
      <RootNavigator />
    </ContextWrapper>
  );
}

function RootNavigator() {
  const reduced = useMotionPreference();
  return <Stack screenOptions={{ animation: reduced ? 'fade' : 'default' }}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-preview" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="summary"
          options={{
            presentation: "card",
            headerShown: false,
            animation: reduced ? "fade" : "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="AddDream"
          options={{
            presentation: "fullScreenModal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Dream"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen name="preferences" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>;
}
