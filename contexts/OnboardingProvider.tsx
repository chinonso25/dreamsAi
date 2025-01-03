import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { storage } from "@/util/storage";

export const ONBOARDING_COMPLETE = "onboarding_complete";

type OnboardingContextType = {
  isOnboardingComplete: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextType>({
  isOnboardingComplete: false,
  completeOnboarding: () => {},
  resetOnboarding: () => {},
});

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    const value = storage.getBoolean(ONBOARDING_COMPLETE);
    setIsOnboardingComplete(Boolean(value));
  }, []);

  const completeOnboarding = () => {
    storage.set(ONBOARDING_COMPLETE, true);
    setIsOnboardingComplete(true);
  };

  const resetOnboarding = () => {
    storage.delete(ONBOARDING_COMPLETE);
    setIsOnboardingComplete(false);
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboardingComplete,
        completeOnboarding,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => useContext(OnboardingContext);
