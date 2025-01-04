import { Redirect, Tabs } from "expo-router";
import React from "react";
import { TabBar } from "@/components/TabBar";
import { useOnboarding } from "@/contexts/OnboardingProvider";

export default function TabLayout() {
  const { isOnboardingComplete } = useOnboarding();

  if (!isOnboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
      tabBar={() => <TabBar />}
    >
      <Tabs.Screen
        options={{
          headerShown: true,
          headerTitle: "DreamAi",
          headerTitleStyle: { fontFamily: "Outfit_700Bold", fontSize: 24 },
        }}
        name="index"
      />
      <Tabs.Screen
        options={{
          headerShown: true,
          headerTitle: "Settings",
          headerTitleStyle: { fontFamily: "Outfit_700Bold", fontSize: 24 },
        }}
        name="settings"
      />
    </Tabs>
  );
}
