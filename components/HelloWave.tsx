import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import styled from "styled-components/native";

interface Props {
  isRecording: boolean;
  meterLevel: number;
}

const NUM_BARS = 50;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 100;
const MIN_BAR_HEIGHT = 3;

const HelloWave: React.FC<Props> = ({ isRecording, meterLevel }) => {
  const barHeights = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(MIN_BAR_HEIGHT))
  ).current;

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
  }, [isRecording, meterLevel]);

  return (
    <Container>
      {barHeights.map((height, index) => (
        <Bar
          key={index}
          style={{
            height,
            backgroundColor: "#000",
            width: BAR_WIDTH,
            marginHorizontal: BAR_GAP / 2,
          }}
        />
      ))}
    </Container>
  );
};

const Container = styled.View({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  height: MAX_BAR_HEIGHT,
  overflow: "hidden",
});

const Bar = styled(Animated.View)({
  borderRadius: BAR_WIDTH / 2,
});

export default HelloWave;
