import {
  View,
  StyleSheet,
  Switch,
  Pressable,
  ScrollView,
  SafeAreaView,
  Alert,
} from "react-native";
import React, { useState } from "react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "@/util/storage";
import { ThemedText } from "@/components/ThemedText";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

const SettingItem = ({
  title,
  icon,
  value,
  onPress,
  hasToggle = false,
  hasChevron = true,
  subtitle,
}: {
  title: string;
  icon: string;
  value?: boolean;
  onPress?: () => void;
  hasToggle?: boolean;
  hasChevron?: boolean;
  subtitle?: string;
}) => {
  const colorScheme = useColorScheme();

  return (
    <Pressable style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingItemLeft}>
        <Ionicons
          name={icon as any}
          size={24}
          color={Colors[colorScheme ?? "light"].text}
          style={styles.settingIcon}
        />
        <View>
          <ThemedText style={styles.settingText}>{title}</ThemedText>
          {subtitle && (
            <ThemedText style={styles.settingSubtext}>{subtitle}</ThemedText>
          )}
        </View>
      </View>
      {hasToggle && (
        <Switch
          value={value}
          onValueChange={onPress}
          trackColor={{
            false: "#767577",
            true: Colors[colorScheme ?? "light"].tint,
          }}
        />
      )}
      {hasChevron && !hasToggle && (
        <Ionicons
          name="chevron-forward"
          size={24}
          color={Colors[colorScheme ?? "light"].text}
        />
      )}
    </Pressable>
  );
};

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const [notifications, setNotifications] = useState(
    storage.getBoolean("notifications") ?? true
  );
  const [dreamReminders, setDreamReminders] = useState(
    storage.getBoolean("dreamReminders") ?? true
  );

  const handleNotificationToggle = async () => {
    try {
      const newValue = !notifications;
      if (newValue) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Please enable notifications in your device settings to receive dream reminders.",
            [{ text: "OK" }]
          );
          return;
        }
      }
      setNotifications(newValue);
      storage.set("notifications", newValue);

      if (!newValue) {
        // Cancel all scheduled notifications if notifications are turned off
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update notification settings");
    }
  };

  const handleDreamRemindersToggle = async () => {
    try {
      const newValue = !dreamReminders;
      setDreamReminders(newValue);
      storage.set("dreamReminders", newValue);

      if (newValue && notifications) {
        // Schedule daily reminder at 8 AM
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Record Your Dream",
            body: "Don't forget to record your dream from last night!",
          },
          trigger: {
            hour: 8,
            minute: 0,
            repeats: true,
          } as any,
        });
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Error", "Failed to update reminder settings");
      }
    }
  };

  const getAppVersion = () => {
    return Constants.expoConfig?.version || "1.0.0";
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <ThemedText style={styles.sectionTitle}>Appearance</ThemedText>
        <SettingItem
          title="Dark Mode"
          icon="moon-outline"
          value={colorScheme === "dark"}
          hasToggle
          subtitle="Uses system settings"
          onPress={() => {
            Alert.alert(
              "System Setting",
              "Dark mode follows your device settings. Please change your device theme to switch between light and dark mode.",
              [{ text: "OK" }]
            );
          }}
        />

        <ThemedText style={styles.sectionTitle}>Notifications</ThemedText>
        <SettingItem
          title="Push Notifications"
          icon="notifications-outline"
          value={notifications}
          hasToggle
          onPress={handleNotificationToggle}
        />
        <SettingItem
          title="Dream Recording Reminders"
          icon="alarm-outline"
          value={dreamReminders}
          hasToggle
          subtitle="Daily reminder at 8 AM"
          onPress={handleDreamRemindersToggle}
        />

        {/* <ThemedText style={styles.sectionTitle}>Account</ThemedText>
        <SettingItem
          title="Profile"
          icon="person-outline"
          onPress={handleProfilePress}
          subtitle={user?.email}
        />
        <SettingItem
          title="Sign Out"
          icon="log-out-outline"
          onPress={handleSignOut}
        /> */}

        <ThemedText style={styles.sectionTitle}>About</ThemedText>
        <SettingItem
          title="App Version"
          icon="information-circle-outline"
          hasChevron={false}
          subtitle={getAppVersion()}
        />
      </ScrollView>
    </SafeAreaView>
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    marginTop: 20,
    marginBottom: 10,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingIcon: {
    marginRight: 12,
  },
  settingText: {
    fontSize: 16,
    fontFamily: "Outfit_400Regular",
  },
  settingSubtext: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    opacity: 0.7,
    marginTop: 2,
  },
});
