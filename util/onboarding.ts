export const questions = [
  {
    id: "goal", eyebrow: "YOUR GOAL", title: "Why start a\ndream journal?",
    description: "Choose your main reason.",
    options: [
      { id: "remember", icon: "moon-outline", title: "Remember more", description: "Keep the details before they disappear" },
      { id: "reflect", icon: "sparkles-outline", title: "Reflect on dreams", description: "Review my entries later" },
      { id: "themes", icon: "planet-outline", title: "Notice recurring themes", description: "Revisit the people, places and feelings" },
      { id: "curious", icon: "compass-outline", title: "Just curious", description: "Try dream journaling" },
    ],
  },
  {
    id: "recall", eyebrow: "WHEN YOU WAKE UP", title: "How much do you\nremember?",
    description: "Choose what you usually remember.",
    options: [
      { id: "rarely", icon: "cloud-outline", title: "Almost nothing", description: "It’s usually gone by morning" },
      { id: "fragments", icon: "extension-puzzle-outline", title: "A few fragments", description: "A few images or feelings" },
      { id: "often", icon: "moon-outline", title: "Most of the story", description: "The details sometimes slip away" },
      { id: "vivid", icon: "sunny-outline", title: "Vivid details", description: "I remember specific details" },
    ],
  },
  {
    id: "obstacle", eyebrow: "JOURNALING", title: "What gets in\nthe way?",
    description: "Choose the main obstacle.",
    options: [
      { id: "fade", icon: "hourglass-outline", title: "Dreams fade too quickly", description: "By the time I write, they’re gone" },
      { id: "busy", icon: "alarm-outline", title: "Mornings are busy", description: "I don’t have time for a long journal" },
      { id: "words", icon: "chatbubble-outline", title: "Finding the words", description: "I remember it, but can’t explain it" },
      { id: "habit", icon: "calendar-outline", title: "Keeping a habit", description: "I start journaling, then forget" },
    ],
  },
  {
    id: "dreams", eyebrow: "DREAM TYPES", title: "What kind of dreams\ndo you notice?",
    description: "Choose the closest match.",
    options: [
      { id: "everyday", icon: "home-outline", title: "Everyday situations", description: "Familiar people in unexpected places" },
      { id: "adventure", icon: "rocket-outline", title: "Adventures", description: "New worlds and impossible things" },
      { id: "recurring", icon: "repeat-outline", title: "The same themes", description: "Similar scenes or feelings repeat" },
      { id: "mixed", icon: "color-palette-outline", title: "A bit of everything", description: "Every night is different" },
    ],
  },
  {
    id: "capture", eyebrow: "ENTRY FORMAT", title: "How would you like\nto capture a dream?",
    description: "You can use either format later.",
    options: [
      { id: "write", icon: "create-outline", title: "Write it down", description: "Type a text entry" },
      { id: "voice", icon: "mic-outline", title: "Record audio", description: "Free recording · optional AI transcription" },
      { id: "both", icon: "swap-horizontal-outline", title: "Text and audio", description: "Choose for each entry" },
    ],
  },
  {
    id: "pace", eyebrow: "SCHEDULE", title: "How often would\nyou like to journal?",
    description: "Choose a suggested schedule.",
    options: [
      { id: "daily", icon: "sunny-outline", title: "Every morning", description: "Record after waking" },
      { id: "few", icon: "calendar-outline", title: "A few times a week", description: "Choose the mornings that suit you" },
      { id: "when", icon: "sparkles-outline", title: "When I remember a dream", description: "No set schedule" },
    ],
  },
] as const;

export type AnswerId = (typeof questions)[number]["id"];
export type OnboardingAnswers = Partial<Record<AnswerId, string>>;
export const LAST_FLOW_STEP = 17;
export const ONBOARDING_DRAFT = "dream_onboarding_v2";

export function validAnswers(value: unknown): OnboardingAnswers {
  if (!value || typeof value !== "object") return {};
  const answers: OnboardingAnswers = {};
  for (const question of questions) {
    const answer = (value as Record<string, unknown>)[question.id];
    if (question.options.some((option) => option.id === answer)) {
      answers[question.id] = answer as string;
    }
  }
  return answers;
}

export function getDreamPlan(answers: OnboardingAnswers) {
  const goal = {
    remember: "Record dreams", reflect: "Reflect on dreams",
    themes: "Find recurring themes", curious: "Try dream journaling",
  }[answers.goal ?? "remember"] ?? "Record dreams";
  const voice = answers.capture === "voice";
  const rhythm = { daily: "Every morning", few: "Three mornings this week", when: "When you remember a dream" }[answers.pace ?? "when"] ?? "When you remember a dream";
  return {
    goal, rhythm, voice,
    capture: voice ? "Record a voice entry" : answers.capture === "both" ? "Write or record an entry" : "Write what you remember",
    captureDetail: voice ? "Recording is free. AI transcription may require Premium after free previews." : "Add a place, person, or feeling. A few details are enough.",
    reflect: answers.goal === "themes" || answers.dreams === "recurring" ? "Review recurring themes" : "Review your entry",
    reflectDetail: answers.goal === "themes" || answers.dreams === "recurring" ? "Compare tags and details across entries." : "Re-read the entry and add any details you recall.",
  };
}

export function recallSnapshot(answers: OnboardingAnswers) {
  const level = { rarely: 1, fragments: 2, often: 3, vivid: 4 }[answers.recall ?? "fragments"] ?? 2;
  const label = ["", "Almost nothing", "A few fragments", "Most of the story", "Vivid details"][level];
  return { level, label };
}
