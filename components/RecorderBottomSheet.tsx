import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useRef, forwardRef, useEffect, useState } from "react";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Alert, View } from "react-native";
import Entypo from "@expo/vector-icons/Entypo";
import styled from "styled-components/native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecordingStore } from "@/store";
import { FullWindowOverlay } from "react-native-screens";
import HelloWave from "./HelloWave";
import type { ReactNode } from "react";
import { millisecondsToMMSS } from "@/util";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

const ContainerComponent = ({ children }: { children?: ReactNode }) => (
  <FullWindowOverlay>{children}</FullWindowOverlay>
);

const RecorderBottomSheet = forwardRef<BottomSheetModal>((_, ref) => {
  const { bottom } = useSafeAreaInsets();
  const { push, dismissAll } = useRouter();
  const { setRecordingUri } = useRecordingStore();

  const recording = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingStatus = useAudioRecorderState(recording);
  console.log(recordingStatus.metering);

  const dreamify = () => {
    setRecordingUri(recording.uri);
    ref.current?.close();
    dismissAll();
    push("/summary");
  };

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert("Permission to access microphone was denied");
      }
    })();
  }, []);

  const startRecording = async () => {
    try {
      recording.record();
    } catch (error) {
      console.error("Failed to start recording", error);
    }
  };

  const pauseRecording = async () => {
    if (recordingStatus.isRecording) {
      recording.pause();
    }
  };

  const handleRecording = async () => {
    if (recordingStatus.isRecording) {
      recording.stop();

      dreamify();
    } else {
      startRecording();
    }
  };

  const closeBottomSheet = async (): Promise<void> => {
    try {
      if (recordingStatus.isRecording) {
        recording.stop();
      }

      ref.current?.close();
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  return (
    <BottomSheetModal
      ref={ref}
      containerComponent={ContainerComponent}
      index={1}
      snapPoints={["70%"]}
    >
      <BottomSheetView
        style={{ flex: 1, alignItems: "center", paddingBottom: bottom }}
      >
        <View style={{ flex: 1 }} />

        <WaveformContainer>
          <HelloWave
            isRecording={recordingStatus.isRecording}
            meterLevel={recordingStatus.metering ?? 0}
          />
        </WaveformContainer>

        <ThemedText type="defaultSemiBold">Recording</ThemedText>
        <ThemedText type="title">
          {millisecondsToMMSS(recordingStatus.durationMillis)}
        </ThemedText>

        <ThemedView
          style={{
            flexDirection: "row",
            justifyContent: "space-evenly",
            width: "100%",
          }}
        >
          <ButtonView>
            <ButtonContainer onPress={closeBottomSheet}>
              <Entypo name="cross" size={48} color="black" />
            </ButtonContainer>
            <ButtonText>Cancel</ButtonText>
          </ButtonView>

          <RecordButtonContainer onPress={handleRecording}>
            <FontAwesome6
              name={recordingStatus.isRecording ? "stop" : "microphone"}
              size={48}
              color="black"
            />
          </RecordButtonContainer>

          <ButtonView>
            <ButtonContainer onPress={pauseRecording}>
              <FontAwesome6 name="pause-circle" size={48} color="black" />
            </ButtonContainer>
            <ButtonText>Pause</ButtonText>
          </ButtonView>
        </ThemedView>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

export default RecorderBottomSheet;

const ButtonView = styled.View({});

const ButtonContainer = styled.TouchableOpacity({
  backgroundColor: "#f5f5f5",
  borderRadius: "50%",
  padding: 16,
  margin: 16,
  justifyContent: "center",
  alignItems: "center",
});

const RecordButtonContainer = styled.TouchableOpacity({
  backgroundColor: "#f5f5f5",
  borderRadius: 100,
  padding: 16,
  margin: 16,
  justifyContent: "center",
  alignItems: "center",
  height: 100,
  width: 100,
});

const ButtonText = styled(ThemedText)`
  text-align: center;
`;

const WaveformContainer = styled.View({
  width: "100%",
  height: 120,
  marginBottom: 20,
  paddingHorizontal: 20,
});
