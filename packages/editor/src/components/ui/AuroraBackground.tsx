import { useEffect, useRef } from 'react';

interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  opacity: number;
  phase: number;
}

const COLORS = [
  'rgba(6, 214, 160, 0.08)',    // cyan
  'rgba(17, 138, 178, 0.06)',   // blue
  'rgba(99, 102, 241, 0.06)',   // indigo
  'rgba(139, 92, 246, 0.05)',   // violet
  'rgba(16, 185, 129, 0.06)',   // emerald
];

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<Orb[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize orbs
    const orbCount = 5;
    orbsRef.current = Array.from({ length: orbCount }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 150 + Math.random() * 200,
      color: COLORS[i % COLORS.length],
      opacity: 0.5 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }));

    let time = 0;

    const animate = () => {
      time += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const orb of orbsRef.current) {
        // Organic movement
        orb.x += orb.vx + Math.sin(time + orb.phase) * 0.2;
        orb.y += orb.vy + Math.cos(time * 0.7 + orb.phase) * 0.2;

        // Wrap around
        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius;
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = canvas.height + orb.radius;
        if (orb.y > canvas.height + orb.radius) orb.y = -orb.radius;

        // Breathing opacity
        const breathe = 0.7 + Math.sin(time * 1.5 + orb.phase) * 0.3;

        // Draw gradient orb
        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius,
        );
        gradient.addColorStop(0, orb.color.replace(/[\d.]+\)$/, `${0.12 * breathe * orb.opacity})`));
        gradient.addColorStop(0.5, orb.color.replace(/[\d.]+\)$/, `${0.05 * breathe * orb.opacity})`));
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(
          orb.x - orb.radius,
          orb.y - orb.radius,
          orb.radius * 2,
          orb.radius * 2,
        );
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
