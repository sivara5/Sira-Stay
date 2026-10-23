import { useCallback } from 'react';

import { Banner } from '@/components/feedback';
import { useI18n } from '@/lib/i18n';
import { findLocationLeaks } from '@/lib/text-leaks';

/**
 * Warning for a phone number, door number, pincode or street address typed into text everyone sees
 * (listing details, review comments), or undefined when the text is fine. Callers block saving while set.
 */
export function useLeakText() {
  const { t } = useI18n();
  return useCallback(
    (value: string) => {
      const [leak] = findLocationLeaks(value);
      return leak ? t(`leak.${leak.kind}`, { text: leak.text }) : undefined;
    },
    [t],
  );
}

/** Why those details can't go in public text. */
export function LeakBanner({ children }: { children: string }) {
  const { t } = useI18n();
  return (
    <Banner tone="warning" title={t('leak.title')} icon="eye-off-outline">
      {children}
    </Banner>
  );
}
