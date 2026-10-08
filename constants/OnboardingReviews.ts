export type OnboardingReview = { quote: string; author: string; rating: 1 | 2 | 3 | 4 | 5; sourceUrl: string };

// Add only permission-cleared, verbatim reviews with a verifiable source.
// When none are supplied, onboarding shows reflection prompts rather than invented testimonials.
export const onboardingReviews: OnboardingReview[] = [];
