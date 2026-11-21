import { useEffect, useState } from "react";

// Seconds left until `expiresAt` (ms since epoch), ticking once a second.
// Null until the first tick, so server and client render the same thing.
export function useCountdown(expiresAt: number | undefined) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (expiresAt === undefined || now === null) return null;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
