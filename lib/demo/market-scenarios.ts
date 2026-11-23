const scenarioTimes = {
  regular: Date.parse('2026-11-20T20:00:00Z'),
  extended: Date.parse('2026-11-20T22:00:00Z'),
  closed: Date.parse('2026-11-21T17:00:00Z'),
};

export type LocalMarketMode = 'realtime' | keyof typeof scenarioTimes;
export const diskMarketModeKey = 'livestocks:local-demo:market-mode';
export const reviewMarketModeKey = 'livestocks:preview:v1:scenario';

export function isFixedScenario(value: string | null): value is keyof typeof scenarioTimes {
  return value !== null && Object.hasOwn(scenarioTimes, value);
}

export function scenarioTime(value: string | null): number | null {
  return isFixedScenario(value) ? scenarioTimes[value] : null;
}
