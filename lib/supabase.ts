import { DEMO_USER_ID } from '@/lib/demo/data';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseInstance = SupabaseClient<any, any, any>;

let cachedClient: SupabaseInstance | null = null;
let currentUserId: string | null = null;
let sessionGeneration = 0;
let sessionRequests = new AbortController();
let tokenRequest: Promise<string> | null = null;
let tokenCache: { value: string; expiresAt: number } | null = null;

/** Invalidate every client and outstanding request from the previous account. */
export function resetSupabaseClient() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('settings');
      // Old navigation and ticker caches can identify the previous user's holdings/watchlist.
      sessionStorage.removeItem('livestocks:return-context');
      Object.keys(localStorage).filter((key) => key.startsWith('watchlist:ticker:'))
        .forEach((key) => localStorage.removeItem(key));
    } catch { /* Storage may be disabled. */ }
  }
  sessionGeneration += 1;
  sessionRequests.abort();
  sessionRequests = new AbortController();
  if (cachedClient) void cachedClient.removeAllChannels();
  cachedClient = null;
  tokenRequest = null;
  tokenCache = null;
  currentUserId = null;
}

export function configureSupabaseUser(userId: string | null) {
  if (userId === currentUserId) return;
  resetSupabaseClient();
  currentUserId = userId;
}

export function getSupabaseClient(): SupabaseInstance {
  if (typeof window === 'undefined') {
    throw new Error('The browser database client cannot be used on the server.');
  }
  if (!currentUserId) throw new Error('A signed-in account is required.');
  if (cachedClient) return cachedClient;

  if (process.env.NODE_ENV === 'development' && currentUserId === DEMO_USER_ID && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    cachedClient = createClient(`${window.location.origin}/api/local-demo`, 'local-demo-public-placeholder', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured.');
  }
  const userId = currentUserId;
  const generation = sessionGeneration;
  const controller = sessionRequests;
  const assertCurrentSession = () => {
    if (generation !== sessionGeneration || userId !== currentUserId) {
      throw new Error('This account session is no longer active.');
    }
  };

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => {
      assertCurrentSession();
      if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
      if (!tokenRequest) {
        const pending = (async () => {
          const response = await fetch('/api/account/database-token', {
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          });
          assertCurrentSession();
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              window.dispatchEvent(new Event('livestocks:session-invalid'));
            }
            throw new Error('Unable to authorize this account for database access.');
          }
          const payload = await response.json() as { accessToken?: string; expiresAt?: number; userId?: string };
          assertCurrentSession();
          if (!payload.accessToken || payload.userId !== userId || !payload.expiresAt || payload.expiresAt * 1000 <= Date.now()) {
            window.dispatchEvent(new Event('livestocks:session-invalid'));
            throw new Error('The database credential does not match the current account.');
          }
          tokenCache = { value: payload.accessToken, expiresAt: payload.expiresAt * 1000 };
          return payload.accessToken;
        })();
        tokenRequest = pending;
        void pending.finally(() => {
          if (tokenRequest === pending) tokenRequest = null;
        }).catch(() => undefined);
      }
      const token = await tokenRequest;
      assertCurrentSession();
      return token;
    },
    global: {
      fetch: (input, init) => {
        assertCurrentSession();
        const signal = init?.signal
          ? AbortSignal.any([init.signal, controller.signal])
          : controller.signal;
        return fetch(input, { ...init, signal });
      },
    },
  });
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
      investment_sources: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          archived_at: string | null;
          legacy_location: string | null;
        };
        Insert: { name: string };
        Update: { name?: string; archived_at?: string | null };
      };
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
          location: string;
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
          location?: string;
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
          location?: string;
        };
      };
      position_lots: {
        Row: {
          id: string;
          position_id: string;
          side: 'BUY' | 'SELL' | 'RECONCILE';
          price: number;
          quantity: number;
          executed_at: string;
          basis_acquired_on?: string | null;
          basis_date_estimate?: string | null;
          has_commission: boolean;
          commission_amount: number;
          commission_known?: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          side: 'BUY' | 'SELL' | 'RECONCILE';
          price: number;
          quantity: number;
          executed_at: string;
          basis_acquired_on?: string | null;
          basis_date_estimate?: string | null;
          has_commission?: boolean;
          commission_amount?: number;
          commission_known?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          side?: 'BUY' | 'SELL' | 'RECONCILE';
          price?: number;
          quantity?: number;
          executed_at?: string;
          basis_acquired_on?: string | null;
          basis_date_estimate?: string | null;
          has_commission?: boolean;
          commission_amount?: number;
          commission_known?: boolean;
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
      location: string | null;
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
      location?: string | null;
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
      location?: string | null;
    };
  };
      settings: {
        Row: {
          id: string;
          annual_growth_rate: number;
          currency: 'USD' | 'ILS';
          refresh_interval: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          annual_growth_rate?: number;
          currency?: 'USD' | 'ILS';
          refresh_interval?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          annual_growth_rate?: number;
          currency?: 'USD' | 'ILS';
          refresh_interval?: number;
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
