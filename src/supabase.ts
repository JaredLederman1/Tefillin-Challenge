import 'react-native-url-polyfill/auto';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qpaiaywpgmusmydivuoq.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = key ? createClient(url, key, { auth: {
  storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web',
} }) : null;
if (supabase && Platform.OS !== 'web') AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
});
export async function uploadCheckin(userId: string, uri: string, caption: string, share: boolean) {
  if (!supabase) throw new Error('Supabase is not connected yet.');
  const bytes = uri.startsWith('data:image/jpeg;base64,') ? decode(uri.split(',')[1]) : await (await fetch(uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('checkins').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.rpc('submit_checkin', { photo_path: path, photo_caption: caption, is_shared: share });
  if (error) { await supabase.storage.from('checkins').remove([path]); throw error; }
}
