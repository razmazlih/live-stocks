import { ReactNode } from 'react';

import { Card, CardBody, CardFooter, CardHeader, Chip, Divider } from '@heroui/react';

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
        const valueClass = card.valueClass ?? 'text-3xl font-semibold text-foreground';

        return (
          <Card key={card.key} radius="lg" shadow="md" className="overflow-hidden">
            <CardHeader className="items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground/70">{card.label}</p>
              {card.badge && (
                <Chip
                  size="sm"
                  variant="flat"
                  startContent={card.badge.icon}
                  className={`gap-1 text-xs font-semibold ${card.badge.className}`}
                >
                  {card.badge.value}
                </Chip>
              )}
            </CardHeader>
            <CardBody className="space-y-3 pt-0">
              <p className={valueClass}>{card.value}</p>
              {card.secondary && (
                <p className="text-sm text-foreground/70">
                  {card.secondary.label}:{' '}
                  <span className="font-medium text-foreground">{card.secondary.value}</span>
                </p>
              )}
              {card.helper?.length ? <Divider /> : null}
              {card.helper?.map((helper) => (
                <p key={`${card.key}-${helper.label}`} className="text-xs text-foreground/60">
                  {helper.label}:{' '}
                  <span className="font-medium text-foreground/80">{helper.value}</span>
                </p>
              ))}
            </CardBody>
            {card.footnote && (
              <CardFooter className="pt-0">
                <p className="text-xs font-medium text-foreground/60">{card.footnote}</p>
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
}
