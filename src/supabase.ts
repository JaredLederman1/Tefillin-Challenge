import { commentWordCount } from './calendar';
import 'react-native-url-polyfill/auto';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qpaiaywpgmusmydivuoq.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secureStorage={
  async getItem(storageKey:string){
    const count=Number(await SecureStore.getItemAsync(`${storageKey}.chunks`));
    if(Number.isSafeInteger(count)&&count>0){const parts=await Promise.all(Array.from({length:count},(_,index)=>SecureStore.getItemAsync(`${storageKey}.${index}`)));return parts.every(Boolean)?parts.join(''):null;}
    const secure=await SecureStore.getItemAsync(storageKey);if(secure)return secure;
    const legacy=await AsyncStorage.getItem(storageKey);if(legacy){await this.setItem(storageKey,legacy);await AsyncStorage.removeItem(storageKey);}return legacy;
  },
  async setItem(storageKey:string,value:string){
    await this.removeItem(storageKey);
    const parts=value.match(/.{1,1800}/gs)||[''];
    await Promise.all(parts.map((part,index)=>SecureStore.setItemAsync(`${storageKey}.${index}`,part)));
    await SecureStore.setItemAsync(`${storageKey}.chunks`,String(parts.length));
  },
  async removeItem(storageKey:string){
    const count=Number(await SecureStore.getItemAsync(`${storageKey}.chunks`));
    if(Number.isSafeInteger(count)&&count>0)await Promise.all(Array.from({length:count},(_,index)=>SecureStore.deleteItemAsync(`${storageKey}.${index}`)));
    await Promise.all([SecureStore.deleteItemAsync(`${storageKey}.chunks`),SecureStore.deleteItemAsync(storageKey),AsyncStorage.removeItem(storageKey)]);
  },
};
export const supabase = key ? createClient(url, key, { auth: {
  storage: Platform.OS==='web'?AsyncStorage:secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web',
} }) : null;
if (supabase && Platform.OS !== 'web') AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
});
export async function uploadCheckin(userId: string, uri: string, caption: string, share: boolean) {
  if (!supabase) throw new Error('Supabase is not connected yet.');
  if (commentWordCount(caption)>10) throw new Error('Comments must be 10 words or fewer.');
  const bytes = uri.startsWith('data:image/jpeg;base64,') ? decode(uri.split(',')[1]) : await (await fetch(uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('checkins').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.rpc('submit_checkin', { photo_path: path, photo_caption: caption, is_shared: share });
  if (error) { await supabase.storage.from('checkins').remove([path]); throw error; }
}
