import { useEffect, useRef } from "react";

/**
 * GlobeAnimation
 * Lightweight pure-CSS/SVG animated globe with orbiting "lead" profile dots.
 * - The globe rotates via CSS keyframes.
 * - Profile dots orbit the globe at different radii, speeds and colors.
 * - A subtle glow and latitude/longitude grid gives it a modern SaaS feel.
 */
export default function GlobeAnimation() {
  const rafRef = useRef(null);

  // Random small twinkle for profile dots — purely decorative.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Orbiting leads: each dot represents a "lead" circling the globe.
  const orbits = [
    { size: 12, color: "#4F46E5", ring: 70, duration: 14, delay: 0, top: "6%", label: "AR" },
    { size: 10, color: "#2563EB", ring: 62, duration: 18, delay: -4, top: "18%", label: "DK" },
    { size: 11, color: "#F59E0B", ring: 82, duration: 22, delay: -8, top: "32%", label: "MS" },
    { size: 9, color: "#7C3AED", ring: 58, duration: 12, delay: -2, top: "48%", label: "JP" },
    { size: 12, color: "#4F46E5", ring: 88, duration: 26, delay: -10, top: "62%", label: "NG" },
    { size: 10, color: "#4F46E5", ring: 66, duration: 16, delay: -6, top: "76%", label: "BR" },
    { size: 8, color: "#F59E0B", ring: 52, duration: 20, delay: -3, top: "88%", label: "DE" },
  ];

  return (
    <div className="globe-wrap" aria-hidden="true">
      {/* Soft outer glow */}
      <div className="globe-glow" />

      {/* The globe itself */}
      <div className="globe-sphere">
        <div className="globe-inner">
          {/* Latitude / longitude dotted grid */}
          <svg className="globe-grid" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="globeShade" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="55%" stopColor="rgba(99,102,241,0.18)" />
                <stop offset="100%" stopColor="rgba(49,46,129,0.20)" />
              </radialGradient>
            </defs>
            {/* Meridians (vertical ellipses) */}
            {[30, 60, 90, 120, 150].map((cx) => (
              <ellipse
                key={`m-${cx}`}
                cx={cx}
                cy="100"
                rx={Math.abs(100 - cx) < 2 ? 92 : Math.max(6, 92 - Math.abs(100 - cx))}
                ry="92"
                fill="none"
                stroke="rgba(79,70,229,0.35)"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
            ))}
            {/* Parallels (horizontal ellipses) */}
            {[40, 70, 100, 130, 160].map((cy) => {
              const dy = Math.abs(100 - cy);
              const rx = Math.round(Math.sqrt(Math.max(0, 92 * 92 - dy * dy)));
              return (
                <ellipse
                  key={`p-${cy}`}
                  cx="100"
                  cy={cy}
                  rx={rx}
                  ry={Math.max(3, rx * 0.22)}
                  fill="none"
                  stroke="rgba(79,70,229,0.30)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
              );
            })}
            {/* Continents — abstract dotted clusters */}
            {[
              { cx: 70, cy: 70, r: 18 },
              { cx: 110, cy: 62, r: 14 },
              { cx: 130, cy: 95, r: 16 },
              { cx: 60, cy: 110, r: 14 },
              { cx: 95, cy: 125, r: 12 },
              { cx: 140, cy: 135, r: 10 },
            ].map((c, i) => (
              <circle
                key={`c-${i}`}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill="rgba(79,70,229,0.12)"
                stroke="rgba(79,70,229,0.35)"
                strokeWidth="1"
                strokeDasharray="1 3"
              />
            ))}
            {/* Shading overlay */}
            <circle cx="100" cy="100" r="94" fill="url(#globeShade)" />
            {/* Outline */}
            <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(79,70,229,0.45)" strokeWidth="1.5" />
          </svg>

          {/* Rotating dotted surface dots */}
          <div className="globe-surface-dots">
            {Array.from({ length: 38 }).map((_, i) => {
              const angle = (i / 38) * Math.PI * 2;
              const y = Math.sin(angle * 2.3) * 70;
              const x = Math.cos(angle) * 86;
              return (
                <span
                  key={i}
                  className="surface-dot"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    animationDelay: `${-i * 0.35}s`,
                    opacity: 0.5 + Math.random() * 0.5,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Reflection highlight */}
        <div className="globe-highlight" />
      </div>

      {/* Orbit rings + flying profile chips */}
      <div className="globe-orbits">
        {orbits.map((o, i) => (
          <div
            key={i}
            className="orbit-ring"
            style={{
              width: `${140 + o.ring * 2}px`,
              height: `${140 + o.ring * 2}px`,
              animationDuration: `${o.duration}s`,
              animationDelay: `${o.delay}s`,
              top: `calc(50% - ${(140 + o.ring * 2) / 2}px)`,
              left: `calc(50% - ${(140 + o.ring * 2) / 2}px)`,
            }}
          >
            <span
              className="orbit-dot"
              style={{
                width: `${o.size + 14}px`,
                height: `${o.size + 14}px`,
                background: o.color,
                color: "#fff",
                boxShadow: `0 8px 20px -6px ${o.color}99, 0 0 0 3px rgba(255,255,255,0.9)`,
              }}
            >
              {o.label}
            </span>
          </div>
        ))}
      </div>

      {/* Stats bubbles — 5 million leads / 196 countries */}
      <div className="globe-stat globe-stat-leads">
        <span className="globe-stat-dot leads" />
        <div>
          <b>5 million</b>
          <small>Verified leads</small>
        </div>
      </div>
      <div className="globe-stat globe-stat-countries">
        <span className="globe-stat-dot countries" />
        <div>
          <b>196</b>
          <small>Countries covered</small>
        </div>
      </div>

      {/* Tiny floating connection lines */}
      <span className="spark s1" />
      <span className="spark s2" />
      <span className="spark s3" />
    </div>
  );
}
