export async function transcribeAudio(audioFilePath: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("file", {
      uri: audioFilePath,
      type: "audio/m4a",
      name: "audio.m4a",
    });
    formData.append("model", "whisper-1");
    formData.append("response", "text");

    let response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${process.env.EXPO_OPEN_API_KEY}`,
        },
        body: formData,
      }
    );
    response = await response.json();
    console.log("response", response);
    return response.text;
  } catch (error) {
    console.error("Failed to transcribe audio:", error);
    return "Failed to transcribe audio";
  }
}
