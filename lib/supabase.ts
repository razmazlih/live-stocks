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
      watchlist_groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      watchlist_tickers: {
        Row: {
          id: string;
          group_id: string;
          symbol: string;
          display: string | null;
          image_url: string | null;
          note: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          symbol: string;
          display?: string | null;
          image_url?: string | null;
          note?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          symbol?: string;
          display?: string | null;
          image_url?: string | null;
          note?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
