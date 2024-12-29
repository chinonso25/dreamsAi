import { StyleSheet, View, SafeAreaView, Button } from "react-native";

import JournalEditor from "@/components/JournalEditor";
import { useRef } from "react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import RecorderBottomSheet from "@/components/RecorderBottomSheet";
import { ThemedText } from "@/components/ThemedText";

export default function HomeScreen() {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present();
  };
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <JournalEditor openBottomSheet={handlePresentModalPress} />
        <RecorderBottomSheet ref={bottomSheetModalRef} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
});
