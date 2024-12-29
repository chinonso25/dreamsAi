import { FontAwesome6 } from "@expo/vector-icons";
import styled from "styled-components/native";
import { ThemedText } from "./ThemedText";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { millisecondsToMMSS } from "@/util";
import { useEffect } from "react";

type Props = {
  audio_url: string;
};

const url =
  "https://clhdhfxpgdyhytgpyvvk.supabase.co/storage/v1/object/sign/dreams/81d8f772-694c-400a-91b5-ad525417af07/recording-D0C6EE5A-02B5-4A2E-B73B-F4460BD873BE.m4a?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJkcmVhbXMvODFkOGY3NzItNjk0Yy00MDBhLTkxYjUtYWQ1MjU0MTdhZjA3L3JlY29yZGluZy1EMEM2RUU1QS0wMkI1LTRBMkUtQjczQi1GNDQ2MEJEODczQkUubTRhIiwiaWF0IjoxNzM1MDk3MzYwLCJleHAiOjE3MzU3MDIxNjB9.-8Zz60kailT9dIy3cPOioGvDRvSBpXlfW7hB5jz37f8&t=2024-12-25T03%3A29%3A20.595Z";

export default function DreamAudioPlayer({ audio_url }: Props) {
  const player = useAudioPlayer(url);

  const playerStatus = useAudioPlayerStatus(player);

  const handlePlay = () => {
    if (playerStatus.isLoaded && !playerStatus.playing) {
      player.play();
    } else if (playerStatus.isLoaded && playerStatus.playing) {
      player.pause();
    }
  };

  const finishedPlaying = playerStatus.currentTime === playerStatus.duration;

  useEffect(() => {
    if (finishedPlaying) {
      player.seekTo(0);
      player.pause();
    }
  }, [finishedPlaying]);

  return (
    <AudioPlayerBar>
      <PlayerContainer>
        <PlayButton onPress={handlePlay}>
          <FontAwesome6
            name={playerStatus.playing ? "pause" : "play"}
            size={24}
            color="white"
          />
        </PlayButton>

        <ThemedText
          style={{ color: "white", fontSize: 12, marginLeft: 8, width: 45 }}
        >
          {millisecondsToMMSS(playerStatus?.currentTime || 0)}
        </ThemedText>

        <SeekerContainer>
          <SeekerBackground />
          <SeekerProgress
            style={{
              width: `${
                ((playerStatus?.currentTime || 0) /
                  (playerStatus?.duration || 1)) *
                100
              }%`,
            }}
          />
          <SeekerKnob
            style={{
              left: `${
                ((playerStatus?.currentTime || 0) /
                  (playerStatus?.duration || 1)) *
                100
              }%`,
            }}
          />
        </SeekerContainer>

        <ThemedText
          style={{ color: "white", fontSize: 12, marginLeft: 8, width: 45 }}
        >
          {millisecondsToMMSS(playerStatus?.duration || 0)}
        </ThemedText>
      </PlayerContainer>
    </AudioPlayerBar>
  );
}

const AudioPlayerBar = styled.View({
  backgroundColor: "#000",
  paddingHorizontal: 16,
  paddingVertical: 12,
  width: "100%",
  marginTop: 8,
  borderRadius: 8,
});

const PlayerContainer = styled.View({
  flexDirection: "row",
  alignItems: "center",
  width: "100%",
});

const PlayButton = styled.TouchableOpacity({
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "#333",
  justifyContent: "center",
  alignItems: "center",
});

const SeekerContainer = styled.View({
  flex: 1,
  height: 20,
  marginHorizontal: 8,
  justifyContent: "center",
});

const SeekerBackground = styled.View({
  position: "absolute",
  width: "100%",
  height: 4,
  backgroundColor: "#444",
  borderRadius: 2,
});

const SeekerProgress = styled.View({
  position: "absolute",
  height: 4,
  backgroundColor: "#fff",
  borderRadius: 2,
});

const SeekerKnob = styled.View({
  position: "absolute",
  width: 12,
  height: 12,
  backgroundColor: "#fff",
  borderRadius: 6,
  marginLeft: -6,
  top: 4,
});
