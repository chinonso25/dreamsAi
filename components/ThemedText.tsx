import { Text, type TextProps, StyleSheet } from "react-native";

import { useThemeColor } from "@/hooks/useThemeColor";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "default"
    | "title"
    | "defaultSemiBold"
    | "subtitle"
    | "link"
    | "caption";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        type === "caption" ? styles.caption : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Outfit_400Regular",
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    fontFamily: "Outfit_600SemiBold",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    lineHeight: 32,
    fontFamily: "Outfit_700Bold",
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Outfit_600SemiBold",
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: "#0a7ea4",
    fontFamily: "Outfit_300Light",
  },
  caption: {
    fontSize: 16,
    lineHeight: 16,
    fontWeight: "500",
    color: "#777",
    fontFamily: "Outfit_300Light",
  },
});
