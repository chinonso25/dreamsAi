import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { AuthProvider } from "./AuthProvider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { OnboardingProvider } from "./OnboardingProvider";
import { SubscriptionProvider } from "./SubscriptionProvider";
import { Platform, useColorScheme } from "react-native";
import { usePathname } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { InitialiseNotifications } from "@/util/notification";
import { MotionProvider } from "@/components/motion/Motion";
import RecordingPlaybackBar from "@/components/RecordingPlaybackBar";
import { CloudQueryProvider } from './CloudQueryProvider';
import { CloudJournalSync } from './CloudJournalSync';

type Props = {
  children: React.ReactNode;
};

Sentry.init({
  enabled: process.env.NODE_ENV === "production",
  dsn: "https://714a66a8d1d852cc90902896228f0e68@o4506939762999296.ingest.us.sentry.io/4508585028354048",
});

export const ContextWrapper = ({ children }: Props) => {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const preview = __DEV__ && Platform.OS === "web" && pathname === "/onboarding-preview";

  useEffect(() => {
    if (!preview) void InitialiseNotifications().catch(() => {});
  }, [preview]);


  if (preview) return <CloudQueryProvider><MotionProvider><OnboardingProvider><SubscriptionProvider disabled>{children}</SubscriptionProvider></OnboardingProvider></MotionProvider></CloudQueryProvider>;

  return (
    <CloudQueryProvider><MotionProvider><GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <CloudJournalSync />
        <SubscriptionProvider>
          <OnboardingProvider>
            <BottomSheetModalProvider>
              <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
              >
                {children}
                <RecordingPlaybackBar />
              </ThemeProvider>
            </BottomSheetModalProvider>
          </OnboardingProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </GestureHandlerRootView></MotionProvider></CloudQueryProvider>
  );
};
