import { View, Text, StyleSheet, Dimensions } from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useOnboarding } from "@/contexts/OnboardingProvider";

const { width } = Dimensions.get("window");

export default function FinalScreen() {
  const { completeOnboarding } = useOnboarding();

  const handleComplete = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      completeOnboarding();
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="check-circle"
            size={64}
            color="#6366f1"
          />
        </View>

        <Text style={styles.title}>You're All Set!</Text>
        <Text style={styles.subtitle}>
          Start capturing your dreams and let AI help you understand them better
        </Text>

        <View style={styles.features}>
          <View style={styles.featureRow}>
            <MaterialCommunityIcons
              name="shield-check"
              size={24}
              color="#6366f1"
            />
            <Text style={styles.featureText}>
              Your dreams are stored securely
            </Text>
          </View>
          <View style={styles.featureRow}>
            <MaterialCommunityIcons name="brain" size={24} color="#6366f1" />
            <Text style={styles.featureText}>AI-powered dream analysis</Text>
          </View>
          <View style={styles.featureRow}>
            <MaterialCommunityIcons
              name="chart-box"
              size={24}
              color="#6366f1"
            />
            <Text style={styles.featureText}>Track patterns over time</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <BlurView
          intensity={100}
          tint="light"
          style={styles.button}
          onTouchStart={handleComplete}
        >
          <Text style={styles.buttonText}>Start Dreaming</Text>
        </BlurView>
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
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
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
    marginBottom: 48,
  },
  features: {
    width: "100%",
    gap: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featureText: {
    fontSize: 16,
    fontFamily: "Outfit_400Regular",
    color: "#0f172a",
  },
  spacer: {
    height: 48,
  },
  button: {
    width: width * 0.8,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
});
