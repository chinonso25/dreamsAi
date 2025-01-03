import { createClient, SupportedStorage } from "@supabase/supabase-js";
import { MMKV } from "react-native-mmkv";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const authStorage = new MMKV({ id: "supabase-storage" });

const mmkvSupabaseSupportedStorage = {
  setItem: (key, data) => authStorage.set(key, data),
  getItem: (key) => authStorage.getString(key) ?? null,
  removeItem: (key) => authStorage.delete(key),
} satisfies SupportedStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: mmkvSupabaseSupportedStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
