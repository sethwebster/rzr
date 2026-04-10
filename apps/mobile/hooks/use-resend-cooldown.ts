import { useCallback, useEffect, useState } from 'react';

export function useResendCooldown(seconds = 30) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      return;
    }

    const timeout = setTimeout(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [remainingSeconds]);

  const startCooldown = useCallback(() => {
    setRemainingSeconds(seconds);
  }, [seconds]);

  return {
    remainingSeconds,
    resendDisabled: remainingSeconds > 0,
    startCooldown,
  };
}
