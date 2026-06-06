// ═══════════════════════════════════════════════════════
// supabase.js — Supabase client (single instance)
// ═══════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ftjgbjyfbmfbfhgxfzne.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0amdianlmYm1mYmZoZ3hmem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTgzNjYsImV4cCI6MjA5NDY3NDM2Nn0.kh1eGySXUZdFgI29yK1oIOBhNKbOnhGliHehKHWl480';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    redirectTo:       'https://eattiebyana.vercel.app',
    persistSession:   true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // Throttle realtime events on mobile
    }
  }
});
