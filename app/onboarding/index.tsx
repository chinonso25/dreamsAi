import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Button,
  TouchableOpacity,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  useFonts,
  Outfit_600SemiBold,
  Outfit_400Regular,
} from "@expo-google-fonts/outfit";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");

export default function WelcomeScreen() {
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_400Regular,
  });
  const router = useRouter();

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="sleep" size={64} color="#6366f1" />
        </View>

        <Text style={styles.title}>Welcome to DreamsAI</Text>
        <Text style={styles.subtitle}>
          Capture your dreams; let AI transform them
        </Text>

        <View style={styles.spacer} />

        <TouchableOpacity onPress={() => router.push("/onboarding/features")}>
          <BlurView
            intensity={100}
            tint="light"
            style={styles.button}
            onTouchStart={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          >
            <Text style={styles.buttonText}>Get Started</Text>
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
  },
  logoContainer: {
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
