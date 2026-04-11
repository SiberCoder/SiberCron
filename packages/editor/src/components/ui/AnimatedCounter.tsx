import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: string;
  duration?: number;
  className?: string;
}

export default function AnimatedCounter({ value, duration = 1200, className }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState('0');
  const prevValue = useRef('0');
  const animRef = useRef<number>(0);

  useEffect(() => {
    // Extract numeric part
    const numericPart = value.replace(/[^0-9.]/g, '');
    const prefix = value.match(/^[^0-9]*/)?.[0] ?? '';
    const suffix = value.match(/[^0-9.]*$/)?.[0] ?? '';
    const targetNum = parseFloat(numericPart) || 0;
    const prevNum = parseFloat(prevValue.current.replace(/[^0-9.]/g, '')) || 0;
    const hasDecimal = numericPart.includes('.');
    const hasComma = value.includes(',');

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing: ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      const current = prevNum + (targetNum - prevNum) * eased;

      let formatted: string;
      if (hasDecimal) {
        formatted = current.toFixed(1);
      } else {
        formatted = Math.round(current).toString();
      }

      if (hasComma) {
        formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }

      setDisplayValue(`${prefix}${formatted}${suffix}`);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    prevValue.current = value;

    return () => cancelAnimationFrame(animRef.current);
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}
