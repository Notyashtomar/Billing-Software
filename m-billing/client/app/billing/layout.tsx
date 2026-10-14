import { BillingLayoutGate } from '@/components/billing/BillingLayoutGate';

export default function BillingAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BillingLayoutGate>{children}</BillingLayoutGate>;
}
