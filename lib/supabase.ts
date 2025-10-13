import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      positions: {
        Row: {
          id: string;
          symbol: string;
          display: string;
          image_url: string;
          entry_price: number;
          quantity: number;
          entry_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          display: string;
          image_url: string;
          entry_price: number;
          quantity: number;
          entry_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          display?: string;
          image_url?: string;
          entry_price?: number;
          quantity?: number;
          entry_date?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      settings: {
        Row: {
          id: string;
          annual_growth_rate: number;
          currency: 'USD' | 'ILS';
          refresh_interval: number;
          finnhub_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          annual_growth_rate?: number;
          currency?: 'USD' | 'ILS';
          refresh_interval?: number;
          finnhub_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          annual_growth_rate?: number;
          currency?: 'USD' | 'ILS';
          refresh_interval?: number;
          finnhub_token?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      position_triggers: {
        Row: {
          id: string;
          symbol: string;
          ts: string;
          items: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          ts?: string;
          items: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          ts?: string;
          items?: unknown;
          created_at?: string;
        };
      };
    };
  };
};
