'use client';

import dynamic from 'next/dynamic';

import { PageLoading } from '@/components/ui/PageLoading';

const LoginPageShell = dynamic(() => import('./LoginPageShell'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center bg-[#03050d]">
      <PageLoading />
    </div>
  ),
});

export default function LoginPage() {
  return <LoginPageShell />;
}
