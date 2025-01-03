import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Switch,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import * as Notifications from "expo-notifications";
import { AudioModule } from "expo-audio";

const { width } = Dimensions.get("window");

export default function PermissionsScreen() {
  const [micEnabled, setMicEnabled] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  const requestMicPermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    setMicEnabled(status.granted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const requestNotificationPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifEnabled(status === "granted");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>App Permissions</Text>
        <Text style={styles.subtitle}>
          To give you the best experience, we need a few permissions
        </Text>

        <View style={styles.permissions}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name="microphone"
                  size={24}
                  color="#6366f1"
                />
              </View>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionTitle}>Microphone Access</Text>
                <Text style={styles.permissionDescription}>
                  Required for voice recording your dreams
                </Text>
              </View>
            </View>
            <Switch
              value={micEnabled}
              onValueChange={requestMicPermission}
              trackColor={{ false: "#e2e8f0", true: "#818cf8" }}
              thumbColor={micEnabled ? "#6366f1" : "#fff"}
            />
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="bell" size={24} color="#6366f1" />
              </View>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionTitle}>Notifications</Text>
                <Text style={styles.permissionDescription}>
                  Get reminders to record your dreams
                </Text>
              </View>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={requestNotificationPermission}
              trackColor={{ false: "#e2e8f0", true: "#818cf8" }}
              thumbColor={notifEnabled ? "#6366f1" : "#fff"}
            />
          </View>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/onboarding/tutorial");
          }}
        >
          <BlurView
            intensity={100}
            style={styles.button}
            onTouchStart={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          >
            <Text style={styles.buttonText}>Continue</Text>
          </BlurView>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: "Outfit_600SemiBold",
    color: "#0f172a",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    fontFamily: "Outfit_400Regular",
    color: "#64748b",
    textAlign: "center",
    maxWidth: width * 0.8,
    marginBottom: 40,
  },
  permissions: {
    width: "100%",
    gap: 16,
  },
  permissionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    color: "#0f172a",
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: "#64748b",
  },
  spacer: {
    height: 32,
  },
  button: {
    width: width * 0.8,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
    marginBottom: 32,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
});
