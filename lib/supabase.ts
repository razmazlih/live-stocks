import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseInstance = SupabaseClient<any, any, any>;

let cachedClient: SupabaseInstance | null = null;

export function getSupabaseClient(): SupabaseInstance {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured.');
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedClient;
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseClient();
      return (client as unknown as Record<PropertyKey, unknown>)[prop];
    },
  },
) as SupabaseInstance;

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
          location: 'bank_one' | 'bank_two';
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
          location?: 'bank_one' | 'bank_two';
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
          location?: 'bank_one' | 'bank_two';
        };
      };
      position_lots: {
        Row: {
          id: string;
          position_id: string;
          side: 'BUY' | 'SELL';
          price: number;
          quantity: number;
          executed_at: string;
          has_commission: boolean;
          commission_amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          side: 'BUY' | 'SELL';
          price: number;
          quantity: number;
          executed_at: string;
          has_commission?: boolean;
          commission_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          side?: 'BUY' | 'SELL';
          price?: number;
          quantity?: number;
          executed_at?: string;
          has_commission?: boolean;
          commission_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      position_plans: {
        Row: {
          id: string;
          position_id: string | null;
          symbol: string;
          display: string | null;
          image_url: string | null;
          side: 'buy' | 'sell';
      target_price: number;
      target_quantity: number;
      target_date: string;
      status: 'pending' | 'triggered' | 'expired' | 'cancelled';
      triggered_at: string | null;
      expired_at: string | null;
      executed_price: number | null;
      has_commission: boolean;
      commission_amount: number;
      created_at: string;
      updated_at: string;
      location: 'bank_one' | 'bank_two' | null;
    };
    Insert: {
      id?: string;
          position_id?: string | null;
          symbol: string;
          display?: string | null;
          image_url?: string | null;
          side?: 'buy' | 'sell';
      target_price: number;
      target_quantity: number;
      target_date: string;
      status?: 'pending' | 'triggered' | 'expired' | 'cancelled';
      triggered_at?: string | null;
      expired_at?: string | null;
      executed_price?: number | null;
      has_commission?: boolean;
      commission_amount?: number;
      created_at?: string;
      updated_at?: string;
      location?: 'bank_one' | 'bank_two' | null;
    };
    Update: {
      id?: string;
          position_id?: string | null;
          symbol?: string;
          display?: string | null;
          image_url?: string | null;
          side?: 'buy' | 'sell';
      target_price?: number;
      target_quantity?: number;
      target_date?: string;
      status?: 'pending' | 'triggered' | 'expired' | 'cancelled';
      triggered_at?: string | null;
      expired_at?: string | null;
      executed_price?: number | null;
      has_commission?: boolean;
      commission_amount?: number;
      created_at?: string;
      updated_at?: string;
      location?: 'bank_one' | 'bank_two' | null;
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
