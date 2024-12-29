import { View, Text, StyleSheet } from "react-native";
import React from "react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";

export default function SettingsScreen() {
  const colorScheme = useColorScheme();

  return (
    <View style={styles.container}>
      <Text
        style={[styles.title, { color: Colors[colorScheme ?? "light"].text }]}
      >
        Settings
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: "Outfit_700Bold",
    marginBottom: 20,
  },
});
