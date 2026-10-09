import { KeyboardAvoidingView, Platform } from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";

type Props = {
  children: React.ReactNode;
};

export default function KeyboardView({ children }: Props) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
