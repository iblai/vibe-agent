import type { ReactNode } from "react";
import { formatAmount, type CataloguePriceView } from "@/lib/paywall-client";

/** One plan as buyers see it on /paywall (and in the setup wizard's last step). */
export function PlanCard({ price, children }: { price: CataloguePriceView; children?: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-6">
      <p className="text-sm font-medium text-foreground">{price.name || "Full access"}</p>
      <p className="text-3xl font-bold text-foreground">
        {formatAmount(price.unitAmount, price.currency)}
        {price.interval && (
          <span className="text-sm font-normal text-muted-foreground">/{price.interval}</span>
        )}
      </p>
      {children}
    </div>
  );
}
