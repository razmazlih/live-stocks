import { ReactNode } from 'react';
import { Card, CardBody, CardFooter, CardHeader, Chip } from '@heroui/react';

export interface SummaryCardBadge {
  value: string;
  color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  variant?: 'solid' | 'bordered' | 'light' | 'flat' | 'faded' | 'shadow' | 'dot';
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
        const valueClass = card.valueClass ?? 'text-3xl font-semibold text-slate-900';

        return (
          <Card
            key={card.key}
            radius="2xl"
            shadow="sm"
            className="relative overflow-hidden border-none bg-white/90 backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-blue-100/40 blur-3xl" />
            <CardHeader className="relative z-10 flex items-center justify-between gap-2 pb-1">
              <p className="text-sm font-semibold text-slate-600">{card.label}</p>
              {card.badge && (
                <Chip
                  size="sm"
                  radius="full"
                  variant={card.badge.variant ?? 'flat'}
                  color={card.badge.color}
                  startContent={card.badge.icon}
                  className="font-semibold"
                >
                  {card.badge.value}
                </Chip>
              )}
            </CardHeader>
            <CardBody className="relative z-10 space-y-3 pt-0">
              <p className={valueClass}>{card.value}</p>
              {card.secondary && (
                <p className="text-sm text-slate-500">
                  {card.secondary.label}:{' '}
                  <span className="font-medium text-slate-700">{card.secondary.value}</span>
                </p>
              )}
              {card.helper?.map((helper) => (
                <p key={`${card.key}-${helper.label}`} className="text-xs text-slate-500">
                  {helper.label}:{' '}
                  <span className="font-medium text-slate-700">{helper.value}</span>
                </p>
              ))}
            </CardBody>
            {card.footnote && (
              <CardFooter className="relative z-10 pt-0 text-xs font-medium text-slate-500">
                {card.footnote}
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
}
