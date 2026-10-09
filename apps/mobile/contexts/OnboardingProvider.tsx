import {
  createContext,
  ReactNode,
  useContext,
  useState,
} from "react";
import { storage } from "@/util/storage";
import { Platform } from "react-native";
import { AnswerId, LAST_FLOW_STEP, ONBOARDING_DRAFT, OnboardingAnswers, validAnswers } from "@/util/onboarding";

export const ONBOARDING_COMPLETE = "onboarding_complete";

type OnboardingContextType = {
  isOnboardingComplete: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  answers: OnboardingAnswers;
  step: number;
  setAnswer: (id: AnswerId, value: string) => void;
  setStep: (step: number) => void;
};

const OnboardingContext = createContext<OnboardingContextType>({
  isOnboardingComplete: false,
  completeOnboarding: () => {},
  resetOnboarding: () => {},
  answers: {}, step: 0, setAnswer: () => {}, setStep: () => {},
});

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(() => Platform.OS === "web" && typeof window === "undefined" ? false : Boolean(storage.getBoolean(ONBOARDING_COMPLETE)));
  const [draft, setDraft] = useState<{ answers: OnboardingAnswers; step: number }>(() => {
    try {
      const saved = JSON.parse(storage.getString(ONBOARDING_DRAFT) ?? "{}");
      const answers = validAnswers(saved.answers);
      const firstMissing = ["goal", "recall", "obstacle", "dreams", "capture", "pace"].findIndex(id => !answers[id as AnswerId]);
      const maxStep = firstMissing < 0 ? LAST_FLOW_STEP : firstMissing + 1;
      return { answers, step: Number.isInteger(saved.step) ? Math.max(0, Math.min(saved.step, maxStep)) : 0 };
    } catch { return { answers: {}, step: 0 }; }
  });

  const updateDraft = (update: (current: typeof draft) => typeof draft) => {
    setDraft(current => {
      const next = update(current);
      storage.set(ONBOARDING_DRAFT, JSON.stringify(next));
      return next;
    });
  };
  const setAnswer = (id: AnswerId, value: string) => updateDraft(current => ({ ...current, answers: validAnswers({ ...current.answers, [id]: value }) }));
  const setStep = (step: number) => updateDraft(current => ({ ...current, step: Math.max(0, Math.min(step, LAST_FLOW_STEP)) }));

  const completeOnboarding = () => {
    storage.set(ONBOARDING_COMPLETE, true);
    setIsOnboardingComplete(true);
  };

  const resetOnboarding = () => {
    storage.remove(ONBOARDING_COMPLETE);
    storage.remove(ONBOARDING_DRAFT);
    setDraft({ answers: {}, step: 0 });
    setIsOnboardingComplete(false);
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboardingComplete,
        completeOnboarding,
        resetOnboarding,
        answers: draft.answers, step: draft.step, setAnswer, setStep,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => useContext(OnboardingContext);
