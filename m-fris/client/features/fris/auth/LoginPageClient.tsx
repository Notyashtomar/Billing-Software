'use client';

import LoginScreen from '@/features/fris/auth/LoginScreen';
import { FrisThemeLock } from '@/components/fris/layout/FrisThemeLock';

export default function LoginPageClient() {
  return (
    <>
      <FrisThemeLock />
      <LoginScreen />
    </>
  );
}
