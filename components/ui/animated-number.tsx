'use client';

import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react';
import { resolveIntlLocale } from '@/lib/display/formatting';
import type { Locale, Settings } from '@/types';
import styles from './animated-number.module.css';

type Kind = 'currency' | 'percent' | 'decimal';
interface Props extends Omit<ComponentPropsWithoutRef<'bdi'>, 'children'> {
  value: number | null | undefined;
  locale: Locale;
  kind?: Kind;
  currency?: Settings['currency'];
  signed?: boolean;
  absolute?: boolean;
  digits?: number;
  identity?: string;
}

const duration = 450;
const batchWindow = 100;
const frames = new Set<(now: number) => void>();
let frame: number | null = null;
let lastPaint = -Infinity;

// Every visible figure shares one clock. Frame updates never re-render the portfolio.
function paint(now: number) {
  frame = null;
  if (now - lastPaint >= 30) {
    lastPaint = now;
    frames.forEach(draw => draw(now));
  }
  if (frames.size && frame === null) frame = requestAnimationFrame(paint);
}

function schedule(draw: (now: number) => void) {
  frames.add(draw);
  if (frame === null) frame = requestAnimationFrame(paint);
  return () => {
    frames.delete(draw);
    if (!frames.size) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastPaint = -Infinity;
    }
  };
}

const formats = new Map<string, Intl.NumberFormat>();
function formatter(locale: Locale, kind: Kind, currency: Settings['currency'], digits: number) {
  const key = [locale, kind, currency, digits].join('/');
  let result = formats.get(key);
  if (!result) {
    result = new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: kind, ...(kind === 'currency' ? {currency} : {}),
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
    formats.set(key, result);
  }
  return result;
}

interface Transition { id: string; shown: number | null; from: number; to: number; pending: number; start: number; stop?: () => void; signalTimer?: ReturnType<typeof setTimeout> }
export function AnimatedNumber({ value, locale, kind = 'currency', currency = 'USD', signed = false, absolute = false, digits = 2, identity = '', className, ...props }: Props) {
  const fraction = Math.min(12, Math.max(0, Math.trunc(digits)));
  // Intl's decimal rounding agrees with the numbers the reader sees, including half cents.
  const target = typeof value === 'number' && Number.isFinite(value)
    ? Number(formatter('en', 'decimal', currency, fraction).format(value).replace(/,/g, '')) || 0 : null;
  const group = [identity, locale, kind, currency, signed, absolute, fraction].join('|');
  const format = useMemo(() => {
    const number = formatter(locale, kind, currency, fraction);
    return (n: number | null) => {
      if (n === null) return '—';
      const v = absolute ? Math.abs(n) : n;
      return (signed && v > 0 ? '+' : '') + number.format(kind === 'percent' ? v / 100 : v);
    };
  }, [locale, kind, currency, fraction, signed, absolute]);
  const label = format(target);
  const root = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLSpanElement>(null);
  const transition = useRef<Transition>({ id: group, shown: target, from: 0, to: 0, pending: 0, start: 0 });
  useLayoutEffect(() => {
    const state = transition.current;
    return () => { state.stop?.(); clearTimeout(state.signalTimer); };
  }, []);
  useLayoutEffect(() => {
    const node = root.current;
    const output = overlay.current;
    if (!node || !output) return;
    const state = transition.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    function settle(n: number | null) {
      state.stop?.();
      state.stop = undefined;
      state.shown = n;
      clearTimeout(state.signalTimer);
      delete node!.dataset.signal;
      delete node!.dataset.move;
      output!.textContent = '';
    }
    function stationarySignal(n: number) {
      const previous = state.shown;
      settle(n);
      if (previous === null || previous === n) return;
      node!.dataset.signal = n > previous ? 'up' : 'down';
      state.signalTimer = setTimeout(() => { delete node!.dataset.signal; }, duration);
    }
    if (state.id !== group || target === null || state.shown === null) {
      state.id = group;
      delete node.dataset.reserve;
      settle(target);
      return;
    }
    const previousLabel = format(state.shown);
    if (!state.stop && state.shown === target) return;
    node.dataset.reserve = [node.dataset.reserve ?? '', previousLabel, label].reduce((a, b) => a.length >= b.length ? a : b);
    if (reduced?.matches || typeof requestAnimationFrame !== 'function') { stationarySignal(target); return; }
    if (state.stop) {
      state.pending = target;
      return;
    }
    state.from = state.shown;
    state.to = state.pending = target;
    state.start = performance.now();
    clearTimeout(state.signalTimer);
    node.dataset.move = 'true';
    node.dataset.signal = target > state.shown ? 'up' : 'down';
    output.textContent = previousLabel;
    state.stop = schedule(now => {
      if (reduced?.matches) { stationarySignal(state.pending); return; }
      if (state.pending !== state.to && now - state.start >= batchWindow) {
        state.from = state.shown ?? state.from;
        state.to = state.pending;
        state.start = now;
        if (state.to === state.from) { settle(state.to); return; }
        node.dataset.signal = state.to > state.from ? 'up' : 'down';
      }
      const elapsed = Math.max(0, now - state.start);
      const progress = Math.min(1, elapsed / duration);
      const interpolated = Number((state.from + (state.to - state.from) * (1 - (1 - progress) ** 3)).toFixed(fraction)) || 0;
      const crossesZero = state.shown !== null && state.shown * interpolated < 0;
      const shown = crossesZero ? 0 : interpolated;
      state.shown = shown;
      const text = format(shown);
      if (output.textContent !== text) output.textContent = text;
      if (progress === 1 && !crossesZero) settle(state.to);
    });
  }, [group, label, target, format, fraction]);
  return <bdi {...props} dir="ltr" className={styles.number + (className ? ' ' + className : '')} ref={root} aria-live="off">
    <span className={styles.settled}>{label}</span><span className={styles.frame} ref={overlay} aria-hidden="true" />
  </bdi>;
}
