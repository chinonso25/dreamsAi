import { Journal, MoodEnum, PrivacyEnum } from "@/types";

export const dummyJournals: Journal[] = [
  {
    id: 1,
    user_id: 101,
    title: "Flying Over Mountains",
    transcript:
      "I dreamt I was soaring high above endless mountain ranges that stretched as far as the eye could see. The peaks were dusted with snow, glistening in the sunlight, while the valleys below were cloaked in lush greenery. The air was crisp and cool, invigorating my senses with every breath. I could feel the wind rushing past me, carrying with it a faint whisper of nature’s symphony. The view was absolutely breathtaking, a blend of vibrant colors and dramatic landscapes that seemed almost otherworldly. As I glided effortlessly through the sky, I felt an overwhelming sense of freedom, as though I had left all my worries far behind. It was a moment of pure exhilaration, a feeling unlike anything I had ever experienced before.",
    audio_url: "https://example.com/audio/journal1.mp3",
    created_at: "2024-04-20T08:30:00Z",
    updated_at: "2024-04-20T09:00:00Z",
    tags: ["flying", "nature", "freedom"],
    mood: MoodEnum.Excited,
    location: "Swiss Alps",
    privacy: PrivacyEnum.Private,
    images: [
      "https://example.com/images/journal1_img1.jpg",
      "https://example.com/images/journal1_img2.jpg",
    ],
    summary: "A thrilling experience of flying over majestic mountains.",
    keywords: ["flying", "mountains", "freedom"],
    audio_length: 120, // seconds
    is_starred: true,
    deleted_at: null,
  },
  {
    id: 2,
    user_id: 102,
    transcript:
      "Last night, I was in a bustling city with towering skyscrapers. The streets were crowded, and the noise was overwhelming. I felt anxious and lost.",
    created_at: "2024-04-21T22:15:00Z",
    tags: ["city", "anxiety", "crowded"],
    mood: MoodEnum.Anxious,
    privacy: PrivacyEnum.FriendsOnly,
    summary: "Navigating through a chaotic and crowded cityscape.",
    keywords: ["city", "skyscrapers", "anxious"],
    is_starred: false,
  },
  {
    id: 3,
    user_id: 101,
    transcript:
      "I found myself in a serene garden filled with blooming flowers and chirping birds. The atmosphere was peaceful, and I felt content and happy.",
    audio_url: "https://example.com/audio/journal3.mp3",
    created_at: "2024-04-22T06:45:00Z",
    updated_at: "2024-04-22T07:15:00Z",
    tags: ["garden", "peaceful", "contentment"],
    mood: MoodEnum.Happy,
    location: "Botanical Gardens",
    privacy: PrivacyEnum.Public,
    images: ["https://example.com/images/journal3_img1.jpg"],
    summary: "A peaceful dream in a beautiful garden.",
    keywords: ["garden", "flowers", "peaceful"],
    audio_length: 90, // seconds
    is_starred: false,
    deleted_at: null,
  },
  {
    id: 4,
    user_id: 103,
    transcript:
      "I was in a mysterious forest where the trees seemed to whisper secrets. Shadows moved between the trunks, and an eerie feeling lingered throughout.",
    created_at: "2024-04-23T03:20:00Z",
    tags: ["forest", "mystery", "eerie"],
    mood: MoodEnum.Curious,
    privacy: PrivacyEnum.Private,
    summary: "Exploring a mysterious and eerie forest.",
    keywords: ["forest", "whispers", "shadows"],
    is_starred: true,
    deleted_at: null,
  },
  {
    id: 5,
    user_id: 102,
    transcript:
      "In my dream, I was attending a grand banquet with friends and family. The food was delicious, and the conversations were lively. I felt joyful and connected.",
    audio_url: "https://example.com/audio/journal5.mp3",
    created_at: "2024-04-24T19:50:00Z",
    tags: ["banquet", "friends", "joy"],
    mood: MoodEnum.Happy,
    privacy: PrivacyEnum.FriendsOnly,
    images: [
      "https://example.com/images/journal5_img1.jpg",
      "https://example.com/images/journal5_img2.jpg",
    ],
    summary: "A joyful gathering with loved ones at a grand banquet.",
    keywords: ["banquet", "friends", "joyful"],
    audio_length: 150, // seconds
    is_starred: false,
    deleted_at: null,
  },
];
