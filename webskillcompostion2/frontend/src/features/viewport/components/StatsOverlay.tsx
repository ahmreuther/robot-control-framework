import { useEffect, useRef } from "react";
import StatsJS from "stats.js";

export default function StatsOverlay() {
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statsRef.current) return;

    const stats = new StatsJS();
    stats.showPanel(0);
    stats.dom.style.position = "absolute";
    statsRef.current.appendChild(stats.dom);

    let frameId = 0;
    const tick = () => {
      stats.update();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      if (statsRef.current && stats.dom.parentNode === statsRef.current) {
        statsRef.current.removeChild(stats.dom);
      }
    };
  }, []);

  return <div ref={statsRef} />;
}
