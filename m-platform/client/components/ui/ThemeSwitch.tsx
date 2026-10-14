'use client';

import styles from './ThemeSwitch.module.css';

export type ThemeSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
};

export function ThemeSwitch({
  checked,
  onChange,
  className,
}: ThemeSwitchProps) {
  return (
    <div className={[styles.styledWrapper, className].filter(Boolean).join(' ')}>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={checked ? 'Switch to light theme' : 'Switch to dark theme'}
        />
        <span className={styles.slider} aria-hidden />
      </label>
    </div>
  );
}
