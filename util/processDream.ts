import { Journal, JournalResponse } from "@/types";

/**
 * Processes a raw audio transcription of a dream and returns a structured Journal JSON.
 * @param transcription - The raw transcription text of the dream.
 * @returns A Promise that resolves to a Journal object.
 */
export async function processDreamTranscription(
  transcription: string
): Promise<JournalResponse> {
  const apiKey = process.env.EXPO_OPEN_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API key is not set in the environment variables.");
  }

  // Define the system message and user prompt

  const userPrompt = `Transcription: "${transcription}"`;

  const payload = {
    model: "gpt-4o-mini", // You can specify the model you prefer
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userPrompt },
    ],
    response_format: dreamSchema,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorDetails}`
      );
    }

    const data = await response.json();

    // Extract the response text
    const responseText: string | undefined =
      data.choices?.[0]?.message?.content;

    return JSON.parse(responseText);
  } catch (error) {
    console.error("Error processing dream transcription:", error);
    throw error; // Re-throw the error after logging
  }
}

const systemMessage = `
Take an audio transcription of a dream spoken in natural, everyday language and transform it into a structured JSON object.

Ensure the transcription is formatted and punctuated correctly, and extract the relevant details as required.

# Steps

1. **Listen and Transcribe**: Input the audio transcription, which is in normal, everyday speech. Ensure to format and punctuate the transcription correctly.
   
2. **Analyze the Content**:
   - Identify a suitable title for the dream based on significant themes or events.
   - Determine relevant tags by identifying main elements or motifs present in the dream.
   - Assess the mood conveyed in the dream from the transcript, selecting from the provided list: "happy," "anxious," "neutral," "excited," "sad," "curious," or "frustrated."
   - Summarize the dream's core story or occurrence in a concise manner.
   - Extract a list of keywords that capture crucial aspects of the dream.

3. **Construct JSON Object**: Use the analyzed data to form a JSON object as specified in the format.

# Output Format

Produce a JSON object structured as follows:

\`\`\`json
{
  "title": "string - title of the dream",
  "transcript": "string - formatted punctuated transcription of what was said",
  "tags": ["related", "tags", "in", "the", "dream"],
  "mood": "mood of the dream",
  "summary": "string – summary of the dream",
  "keywords": ["keywords", "related", "to", "dream"]
}
\`\`\`

The fields \`tags\`, \`mood\`, \`summary\`, and \`keywords\` are optional and should be included if relevant information is captured from the transcript.

# Examples

**Input**: Transcription of a dream that includes phrases spoken colloquially and with errors.

**Output**:
\`\`\`json
{
  "title": "Flying Over Mountains",
  "transcript": "I was in this big open field, and suddenly, I started flying over mountains. It felt liberating, like nothing could stop me.",
  "tags": ["flying", "freedom", "nature"],
  "mood": "happy",
  "summary": "The dream involved flying over beautiful mountain landscapes, experiencing a strong sense of liberation and joy.",
  "keywords": ["flying", "mountains", "liberation"]
}
\`\`\`

# Notes

- Consider potential transcription errors due to the casual and spontaneous nature of dream recounting.
- The title and tags should effectively encapsulate the essence of the dream.
- When unsure, lean towards more general interpretations for mood and summary.
`;

const dreamSchema = {
  type: "json_schema",
  json_schema: {
    name: "dream_schema",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the dream.",
        },
        transcript: {
          type: "string",
          description: "Formatted punctuated transcription of what was said.",
        },
        tags: {
          type: "array",
          description: "Related tags in the dream.",
          items: {
            type: "string",
          },
        },
        mood: {
          type: "string",
          description: "Mood of the dream.",
        },
        summary: {
          type: "string",
          description: "Summary of the dream.",
        },
        keywords: {
          type: "array",
          description: "Keywords related to the dream.",
          items: {
            type: "string",
          },
        },
      },
      required: ["title", "transcript", "tags", "mood", "summary", "keywords"],
      additionalProperties: false,
    },
  },
};
