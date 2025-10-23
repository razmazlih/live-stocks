import { ReactNode } from 'react';
import { Card, CardBody, CardFooter, CardHeader, Chip } from '@heroui/react';

import { cn } from '@/lib/utils';

export interface SummaryCardBadge {
  value: string;
  className: string;
  icon: ReactNode;
}

export interface SummaryCardHelper {
  label: string;
  value: string;
}

export interface SummaryCardSecondary {
  label: string;
  value: string;
}

export interface SummaryCard {
  key: string;
  label: string;
  value: string;
  valueClass?: string;
  secondary?: SummaryCardSecondary;
  helper?: SummaryCardHelper[];
  badge?: SummaryCardBadge;
  footnote?: string;
}

interface SummaryCardGridProps {
  cards: SummaryCard[];
}

export function SummaryCardGrid({ cards }: SummaryCardGridProps) {
  if (!cards.length) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const valueClass = cn('text-3xl font-semibold text-white', card.valueClass);

        return (
          <Card
            key={card.key}
            radius="2xl"
            className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-0 opacity-30">
              <div className="absolute -right-16 top-0 h-32 w-32 rounded-full bg-primary-500/30 blur-3xl" />
              <div className="absolute bottom-[-3rem] left-[-2rem] h-24 w-24 rounded-full bg-sky-500/20 blur-3xl" />
            </div>
            <div className="relative z-10 flex h-full flex-col">
              <CardHeader className="flex items-start justify-between gap-3 pb-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{card.label}</p>
                  <p className={valueClass}>{card.value}</p>
                </div>
                {card.badge && (
                  <Chip
                    size="sm"
                    radius="full"
                    variant="flat"
                    className={cn(
                      'gap-1 border-none bg-white/10 text-white shadow-sm backdrop-blur-lg',
                      card.badge.className
                    )}
                    startContent={<span className="text-base">{card.badge.icon}</span>}
                  >
                    {card.badge.value}
                  </Chip>
                )}
              </CardHeader>
              <CardBody className="flex flex-1 flex-col justify-start gap-2 px-6 pb-2 text-sm text-white/70">
                {card.secondary && (
                  <p>
                    {card.secondary.label}:{' '}
                    <span className="font-semibold text-white">{card.secondary.value}</span>
                  </p>
                )}
                {card.helper?.map((helper) => (
                  <p key={`${card.key}-${helper.label}`} className="text-xs uppercase tracking-wide text-white/60">
                    {helper.label}:{' '}
                    <span className="text-sm font-semibold text-white/80">{helper.value}</span>
                  </p>
                ))}
              </CardBody>
              {card.footnote && (
                <CardFooter className="border-t border-white/10 px-6 py-4 text-xs font-medium text-white/50">
                  {card.footnote}
                </CardFooter>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
