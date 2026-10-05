import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase no configurado: faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export type OnlineGameState = {
  id: string;
  player1: { id: string; name: string; connected: boolean };
  player2: { id: string | null; name: string | null; connected: boolean };
  game_state: any; // GameState from the engine
  current_turn: 'player1' | 'player2';
  status: 'waiting' | 'playing' | 'finished';
  winner: 'player1' | 'player2' | 'draw' | null;
  created_at: string;
  updated_at: string;
};

export type PlayerRole = 'player1' | 'player2' | 'spectator';

export type OnlineAction = {
  type: 'action' | 'sync' | 'join' | 'leave' | 'rematch';
  payload: any;
  playerId: string;
  timestamp: number;
};