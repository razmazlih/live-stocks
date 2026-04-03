import { NextResponse } from 'next/server';

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

interface JsonNoStoreOptions {
  status?: number;
  headers?: Record<string, string>;
}

function resolveJsonOptions(options?: number | JsonNoStoreOptions): JsonNoStoreOptions {
  if (typeof options === 'number') {
    return { status: options };
  }

  return options ?? {};
}

export function jsonNoStore<T>(data: T, options?: number | JsonNoStoreOptions) {
  const resolved = resolveJsonOptions(options);

  return NextResponse.json(data, {
    status: resolved.status,
    headers: {
      ...NO_STORE_HEADERS,
      ...(resolved.headers ?? {}),
    },
  });
}

export function errorNoStore(
  message: string,
  status: number,
  headers?: Record<string, string>,
) {
  return jsonNoStore({ error: message }, { status, headers });
}

export function parseBooleanFlag(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export function parseSymbolsList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}
