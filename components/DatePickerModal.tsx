import { MotionPressable, useMotionPreference } from './motion/Motion';
import { useState } from 'react';
import { Modal, Platform, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useJournalColors } from "./journal/theme";
import { ThemedText } from "./ThemedText";

type DatePickerModalProps = {
  isVisible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  maximumDate?: Date;
};

export function DatePickerModal(props: DatePickerModalProps) {
  if (!props.isVisible) return null;
  return <DatePickerContents key={props.selectedDate.getTime()} {...props} />;
}

function DatePickerContents({
  isVisible,
  onClose,
  selectedDate,
  onDateChange,
  maximumDate = new Date(),
}: DatePickerModalProps) {
  const colors = useJournalColors();
  const reduced = useMotionPreference();
  const [pendingDate, setPendingDate] = useState(selectedDate);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      onClose();
    }
    if (event.type === 'set' && date) {
      if (Platform.OS === 'android') onDateChange(date);
      else setPendingDate(date);
    }
  };

  if (Platform.OS === "android") {
    if (!isVisible) return null;
    return (
      <DateTimePicker
        value={selectedDate}
        mode="date"
        display="default"
        onChange={handleDateChange}
        maximumDate={maximumDate}
      />
    );
  }

  return (
    <Modal
      animationType={reduced ? "fade" : "slide"}
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel="Cancel" style={styles.button} onPress={onClose}>
              <ThemedText type="defaultSemiBold">Cancel</ThemedText>
            </MotionPressable>
            <MotionPressable haptic="selection" accessibilityRole="button" accessibilityLabel="Done" style={styles.button} onPress={() => { onDateChange(pendingDate); onClose(); }}>
              <ThemedText type="defaultSemiBold">Done</ThemedText>
            </MotionPressable>
          </View>
          <DateTimePicker
            value={pendingDate}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            maximumDate={maximumDate}
            textColor={colors.ink}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  content: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 16 },
  button: { minWidth: 64, minHeight: 48, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 16 },
});
