import { NextRequest, NextResponse } from 'next/server';

import { FORECAST_BASE_URL } from '@/lib/forecast-config';

type Awaitable<T> = T | Promise<T>;

type RouteParams = {
  params: Awaitable<{
    horizon: string;
    symbol: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { horizon, symbol } = await params;

  const baseUrl = FORECAST_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Forecast service is not configured.' },
      { status: 503 }
    );
  }

  const trimmedSymbol = symbol?.trim();
  const trimmedHorizon = horizon?.trim();

  if (!trimmedSymbol || !trimmedHorizon) {
    return NextResponse.json(
      { error: 'Symbol and horizon are required.' },
      { status: 400 }
    );
  }

  const horizonValue = Number.parseInt(trimmedHorizon, 10);
  if (!Number.isFinite(horizonValue) || horizonValue <= 0) {
    return NextResponse.json(
      { error: 'Horizon must be a positive integer.' },
      { status: 400 }
    );
  }

  const normalizedSymbol = trimmedSymbol.toUpperCase();
  const upstreamUrl = new URL(
    `predict/${horizonValue}/ticker/${normalizedSymbol}`,
    `${baseUrl}/`,
  );

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        accept: 'application/json',
      },
      // We let upstream errors propagate to the client.
      cache: 'no-store',
    });

    const textBody = await response.text();
    let jsonPayload: unknown;

    if (textBody.length > 0) {
      try {
        jsonPayload = JSON.parse(textBody);
      } catch (_err) {
        return NextResponse.json(
          {
            error: 'Forecast service returned invalid JSON payload.',
            details: textBody,
          },
          { status: 502 }
        );
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Forecast service returned an error response.',
          status: response.status,
          payload: jsonPayload ?? textBody ?? null,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(jsonPayload, {
      status: response.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { error: 'Unable to reach forecast service.', details: message },
      { status: 502 }
    );
  }
}
