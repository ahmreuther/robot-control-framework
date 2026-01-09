import { useEffect, useRef } from 'react';
import StatsJS from 'stats.js';

export function Stats() {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInstanceRef = useRef<StatsJS | null>(null);

  useEffect(() => {
    if (!statsRef.current) return;

    // Create Stats instance
    const stats = new StatsJS();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    statsInstanceRef.current = stats;

    // Style the stats panel
    stats.dom.style.position = 'absolute';
    //stats.dom.style.left = '0px';
    //stats.dom.style.top = '0px';
    //stats.dom.style.zIndex = '100';

    // Append to container
    statsRef.current.appendChild(stats.dom);

    // Animation loop - just update stats
    function animate() {
      stats.update();
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (statsRef.current && stats.dom.parentNode === statsRef.current) {
        statsRef.current.removeChild(stats.dom);
      }
    };
  }, []);

  return <div ref={statsRef} />;
}