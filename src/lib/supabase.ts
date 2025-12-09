import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Sound = {
  id: string;
  file_name: string;
  file_url: string;
  plays_completed: number;
  total_plays: number;
  is_playing: boolean;
  created_at: string;
  next_play_at: string;
};
