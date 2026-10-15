import { useEffect, useState } from 'react';

/** Seconds remaining until `restart` can be used again (OTP resend cooldown). */
export function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return { seconds, restart: () => setSeconds(initial) };
}
