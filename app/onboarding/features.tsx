import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Link, router } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Outfit_600SemiBold,
  Outfit_400Regular,
} from "@expo-google-fonts/outfit";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");

const features = [
  {
    icon: "pencil" as const,
    title: "Dream Journal",
    description: "Write down your dreams in detail, right after you wake up",
  },
  {
    icon: "microphone" as const,
    title: "Voice Recording",
    description:
      "Record your dreams by speaking naturally - we'll transcribe it",
  },
  {
    icon: "robot" as const,
    title: "AI Analysis",
    description:
      "Get AI-generated summaries and interpretations of your dreams",
  },
];

export default function FeaturesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Core Features</Text>
          <Text style={styles.subtitle}>
            Everything you need to capture and understand your dreams
          </Text>

          <View style={styles.features}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons
                    name={feature.icon}
                    size={32}
                    color="#6366f1"
                  />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.spacer} />

          <TouchableOpacity
            onPress={() => router.push("/onboarding/permissions")}
          >
            <BlurView
              intensity={100}
              tint="light"
              style={styles.button}
              onTouchStart={() =>
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              }
            >
              <Text style={styles.buttonText}>Continue</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  features: {
    width: "100%",
    gap: 24,
  },
  featureCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontFamily: "Outfit_600SemiBold",
    color: "#0f172a",
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 16,
    fontFamily: "Outfit_400Regular",
    color: "#64748b",
    lineHeight: 24,
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
