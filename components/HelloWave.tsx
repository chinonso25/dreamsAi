import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface Props {
  isRecording: boolean;
  meterLevel: number;
  theme: string;
}

const NUM_BARS = 50;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 100;
const MIN_BAR_HEIGHT = 3;

const HelloWave: React.FC<Props> = ({ isRecording, meterLevel, theme }) => {
  const [barHeights] = useState(() =>
    Array.from({ length: NUM_BARS }, () => new Animated.Value(MIN_BAR_HEIGHT))
  );

  useEffect(() => {
    if (isRecording) {
      // Calculate heights based on meter level
      const centerIndex = Math.floor(NUM_BARS / 2);
      const animations = barHeights.map((bar, index) => {
        // Create a bell curve effect where bars in the middle are taller
        const distanceFromCenter = Math.abs(index - centerIndex);
        const heightMultiplier = Math.exp(
          -(distanceFromCenter * distanceFromCenter) /
            (2 * (NUM_BARS / 4) * (NUM_BARS / 4))
        );
        const targetHeight =
          MIN_BAR_HEIGHT +
          (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * meterLevel * heightMultiplier;

        return Animated.spring(bar, {
          toValue: targetHeight,
          friction: 8,
          tension: 40,
          useNativeDriver: false,
        });
      });

      Animated.parallel(animations).start();
    } else {
      // Reset all bars to minimum height when not recording
      const animations = barHeights.map((bar) =>
        Animated.spring(bar, {
          toValue: MIN_BAR_HEIGHT,
          friction: 8,
          tension: 40,
          useNativeDriver: false,
        })
      );
      Animated.parallel(animations).start();
    }
  }, [isRecording, meterLevel, barHeights]);

  return (
    <View style={styles.container}>
      {barHeights.map((height, index) => (
        <Animated.View
          key={index}
          style={[styles.bar, {
            height,
            backgroundColor: theme === "dark" ? "white" : "black",
          }]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: MAX_BAR_HEIGHT, overflow: "hidden" },
  bar: { borderRadius: BAR_WIDTH / 2, width: BAR_WIDTH, marginHorizontal: BAR_GAP / 2 },
});

export default HelloWave;
