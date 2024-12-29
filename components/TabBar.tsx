import { View, StyleSheet, Pressable } from "react-native";
import React from "react";
import { BlurView } from "expo-blur";
import { IconSymbol } from "./ui/IconSymbol";
import { Text } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { usePathname, router } from "expo-router";

type Route = "/(tabs)" | "/(tabs)/explore" | "/AddDream" | "/(tabs)/settings";

export function TabBar() {
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme ?? "light"].tint;
  const pathname = usePathname();

  const tabs = [
    { name: "Home", icon: "house.fill" as const, route: "/(tabs)" as Route },

    { name: "Add Dream", icon: "plus" as const, route: "/AddDream" as Route },
    {
      name: "Profile",
      icon: "person.fill" as const,
      route: "/(tabs)/settings" as Route,
    },
  ];

  return (
    <View style={styles.container}>
      <BlurView intensity={30} style={styles.blur}>
        <View style={styles.content}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.name}
              style={styles.tab}
              onPress={() => router.push(tab.route)}
            >
              <IconSymbol
                name={tab.icon}
                size={24}
                color={pathname === tab.route ? tintColor : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: pathname === tab.route ? tintColor : "#9CA3AF",
                  },
                ]}
              >
                {tab.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    height: 65,
  },
  blur: {
    borderRadius: 32,
    overflow: "hidden",
    height: "100%",
  },
  content: {
    flexDirection: "row",
    height: "100%",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  label: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: "Outfit_500Medium",
  },
});
