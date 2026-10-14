'use client';

import { useEffect, useState } from 'react';
import { Toaster as Sonner } from 'sonner';
import { FRIS_LIGHT_LOCK_ATTR } from '@/components/fris/layout/fris-light-lock';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function useResolvedSonnerTheme(): ToasterProps['theme'] {
  const [theme, setTheme] = useState<ToasterProps['theme']>('light');

  useEffect(() => {
    const resolve = () => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      if (root.hasAttribute(FRIS_LIGHT_LOCK_ATTR)) {
        setTheme('light');
        return;
      }
      if (root.classList.contains('dark')) {
        setTheme('dark');
        return;
      }
      if (root.classList.contains('light')) {
        setTheme('light');
        return;
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    };

    resolve();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', FRIS_LIGHT_LOCK_ATTR],
    });
    return () => {
      mq.removeEventListener('change', resolve);
      observer.disconnect();
    };
  }, []);

  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedSonnerTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
