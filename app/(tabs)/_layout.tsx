import { router, Tabs } from "expo-router";
import React from "react";
import { TabBar } from "@/components/TabBar";

export default function TabLayout() {
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
          headerSearchBarOptions: {
            placeholder: "Search Dreams",
            onChangeText: (event) => {
              const query = event.nativeEvent.text;
              router.setParams({ searchQuery: query });
            },
          },
        }}
        name="index"
      />
      <Tabs.Screen options={{ headerShown: true }} name="settings" />
    </Tabs>
  );
}
