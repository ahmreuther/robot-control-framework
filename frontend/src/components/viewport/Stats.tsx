import { useEffect, useRef } from 'react';
import StatsJS from 'stats.js';

export function Stats() {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInstanceRef = useRef<StatsJS | null>(null);

  useEffect(() => {
    if (!statsRef.current) return;

    const stats = new StatsJS();
    stats.showPanel(0);
    statsInstanceRef.current = stats;

    stats.dom.style.position = 'absolute';

    statsRef.current.appendChild(stats.dom);

    // Animation loop - just update stats
    function animate() {
      stats.update();
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    return () => {
      if (statsRef.current && stats.dom.parentNode === statsRef.current) {
        statsRef.current.removeChild(stats.dom);
      }
    };
  }, []);

  return <div ref={statsRef} />;
}