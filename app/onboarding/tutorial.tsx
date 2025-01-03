import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Link, router } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");

const tutorials = [
  {
    icon: "pencil" as const,
    title: "Write Your Dream",
    description:
      "Open the app right after waking up and type out your dream in detail.",
  },
  {
    icon: "microphone" as const,
    title: "Record Your Voice",
    description:
      "Tap the microphone button and speak naturally about your dream.",
  },
  {
    icon: "robot" as const,
    title: "AI Analysis",
    description:
      "Our AI will automatically generate a title and summary for your dream.",
  },
  {
    icon: "tag-multiple" as const,
    title: "Dream Tags",
    description:
      "Add tags to your dreams to track recurring themes and symbols.",
  },
  {
    icon: "chart-timeline-variant" as const,
    title: "Dream Timeline",
    description: "View your dreams in a beautiful timeline to spot patterns.",
  },
];

export default function TutorialScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>How It Works</Text>
        <Text style={styles.subtitle}>
          Let's walk through the main features of DreamsAI
        </Text>

        <View style={styles.tutorials}>
          {tutorials.map((tutorial, index) => (
            <View key={index} style={styles.tutorialCard}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons
                  name={tutorial.icon}
                  size={32}
                  color="#6366f1"
                />
              </View>
              <Text style={styles.tutorialTitle}>{tutorial.title}</Text>
              <Text style={styles.tutorialDescription}>
                {tutorial.description}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/onboarding/final");
          }}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
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
  tutorials: {
    width: "100%",
    gap: 24,
  },
  tutorialCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  tutorialTitle: {
    fontSize: 20,
    fontFamily: "Outfit_600SemiBold",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  tutorialDescription: {
    fontSize: 16,
    fontFamily: "Outfit_400Regular",
    color: "#64748b",
    textAlign: "center",
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
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
});
