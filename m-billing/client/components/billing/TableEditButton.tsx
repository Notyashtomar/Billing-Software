'use client';

import { billingUi } from './billingUi';

export function TableEditButton({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className={billingUi.link}>
      {label}
    </button>
  );
}
