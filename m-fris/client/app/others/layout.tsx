import { FrisNavbarLazy } from '@/components/fris/layout/FrisNavbarLazy';
import { FrisRouteGuard } from '@/components/fris/layout/FrisRouteGuard';
import { FrisThemeLock } from '@/components/fris/layout/FrisThemeLock';
import { Toaster } from '@/components/ui/sonner';

export default function OthersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FrisRouteGuard>
      <FrisThemeLock />
      <div className="min-h-screen bg-[#f7f8fa] text-gray-900">
        <FrisNavbarLazy />
        <main className="pt-12">{children}</main>
        <Toaster position="top-right" richColors />
      </div>
    </FrisRouteGuard>
  );
}
