import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useRef, forwardRef, useEffect, useState } from "react";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Alert, View } from "react-native";
import Entypo from "@expo/vector-icons/Entypo";
import styled from "styled-components/native";
import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecordingStore } from "@/store";
import { FullWindowOverlay } from "react-native-screens";
import HelloWave from "./HelloWave";
import type { ReactNode } from "react";

function formatSecondsToHMS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const hoursStr = hours > 0 ? `${hours}:` : "";
  const minutesStr =
    hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const secondsStr = String(secs).padStart(2, "0");

  return `${hoursStr}${minutesStr}:${secondsStr}`;
}

const ContainerComponent = ({ children }: { children?: ReactNode }) => (
  <FullWindowOverlay>{children}</FullWindowOverlay>
);

const RecorderBottomSheet = forwardRef<BottomSheetModal>((_, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [meterLevel, setMeterLevel] = useState(0);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const meterInterval = useRef<NodeJS.Timeout | null>(null);
  const { bottom } = useSafeAreaInsets();
  const { push, dismissAll } = useRouter();
  const { setRecordingUri, currentRecordingUri } = useRecordingStore();

  useEffect(() => {
    if (currentRecordingUri && !isRecording && ref && "current" in ref) {
      ref.current?.close();
      dismissAll();
      push("/summary");
    }
  }, [currentRecordingUri, isRecording]);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission to access microphone was denied");
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    })();
  }, []);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission to access microphone was denied");
        return;
      }
      const newRecording = new Audio.Recording();

      await newRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);

      // Time interval for recording duration
      recordingInterval.current = setInterval(() => {
        newRecording.getStatusAsync().then((status) => {
          if (status.isRecording) {
            setCurrentTime(status.durationMillis / 1000);
          }
        });
      }, 1000);

      // Metering interval for audio levels
      meterInterval.current = setInterval(async () => {
        try {
          const status = await newRecording.getStatusAsync();
          if (status.isRecording && "metering" in status) {
            const { metering = -160 } = status;
            // Convert dB to a 0-1 range, where -160dB is 0 and 0dB is 1
            const normalizedValue = (metering + 160) / 160;
            setMeterLevel(Math.max(0, Math.min(1, normalizedValue)));
          }
        } catch (error) {
          console.error("Failed to get metering:", error);
        }
      }, 100); // Update every 100ms for smooth visualization
    } catch (error) {
      console.error("Failed to start recording", error);
    }
  };

  const stopMeteringAndRecording = () => {
    if (meterInterval.current) {
      clearInterval(meterInterval.current);
      meterInterval.current = null;
    }
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
    setMeterLevel(0);
    setIsRecording(false);
  };

  const pauseRecording = async () => {
    if (recording) {
      await recording.pauseAsync();
      stopMeteringAndRecording();
    }
  };

  const resumeRecording = async () => {
    if (recording) {
      await recording.startAsync();
      setIsRecording(true);

      recordingInterval.current = setInterval(() => {
        recording.getStatusAsync().then((status) => {
          if (status.isRecording) {
            setCurrentTime(status.durationMillis / 1000);
          }
        });
      }, 1000);

      meterInterval.current = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording && "metering" in status) {
            const { metering = -160 } = status;
            const normalizedValue = (metering + 160) / 160;
            setMeterLevel(Math.max(0, Math.min(1, normalizedValue)));
          }
        } catch (error) {
          console.error("Failed to get metering:", error);
        }
      }, 100);
    }
  };

  const handleRecording = async () => {
    if (recording) {
      await recording.stopAndUnloadAsync();
      stopMeteringAndRecording();
      const uri = recording.getURI();
      if (uri) {
        setRecordingUri(uri);
      }
    } else {
      startRecording();
    }
  };

  const closeBottomSheet = async (): Promise<void> => {
    try {
      if (recording) {
        const status = await recording.getStatusAsync();
        if (status.isRecording) {
          await recording.stopAndUnloadAsync();
        }
        setRecording(null);
      }

      stopMeteringAndRecording();
      setCurrentTime(0);

      if (ref && "current" in ref) {
        ref.current?.close();
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecording(false);
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
          <HelloWave isRecording={isRecording} meterLevel={meterLevel} />
        </WaveformContainer>

        <ThemedText type="defaultSemiBold">Recording</ThemedText>
        <ThemedText type="title">{formatSecondsToHMS(currentTime)}</ThemedText>

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
              name={isRecording ? "stop" : "microphone"}
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
