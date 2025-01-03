import { View, SafeAreaView } from "react-native";

import JournalEditor from "@/components/JournalEditor";
import { useRef } from "react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import RecorderBottomSheet from "@/components/RecorderBottomSheet";

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
