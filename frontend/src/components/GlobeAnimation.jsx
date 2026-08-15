import { useEffect, useRef } from "react";

/**
 * GlobeAnimation
 * Lightweight pure-CSS/SVG animated globe with orbiting "lead" profile dots.
 * - The globe rotates via CSS keyframes.
 * - Profile dots orbit the globe at different radii, speeds, tilts and colors.
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

  // Orbiting leads: each chip represents a "lead" circling the globe.
  // ring  = orbit radius (px) measured from globe center.
  // tiltX / tiltY = per-orbit 3D tilt so the rings fan out instead of stacking.
  const orbits = [
    { size: 12, color: "#4F46E5", ring: 62, duration: 14, delay: 0,  tiltX: 68, tiltY:   8, direction:  1, label: "AR" },
    { size: 10, color: "#2563EB", ring: 72, duration: 18, delay: -4, tiltX: 74, tiltY: -20, direction: -1, label: "DK" },
    { size: 11, color: "#F59E0B", ring: 84, duration: 22, delay: -8, tiltX: 60, tiltY:  25, direction:  1, label: "MS" },
    { size: 9,  color: "#7C3AED", ring: 56, duration: 12, delay: -2, tiltX: 80, tiltY:  -5, direction: -1, label: "JP" },
    { size: 12, color: "#4F46E5", ring: 92, duration: 26, delay: -10, tiltX: 55, tiltY:  35, direction:  1, label: "NG" },
    { size: 10, color: "#4F46E5", ring: 66, duration: 16, delay: -6, tiltX: 72, tiltY: -30, direction: -1, label: "BR" },
    { size: 8,  color: "#F59E0B", ring: 50, duration: 20, delay: -3, tiltX: 82, tiltY:  15, direction:  1, label: "DE" },
  ];

  // Distribute surface dots around the sphere using spherical coordinates
  // so they actually sit on the globe instead of scribbling a lissajous.
  const DOT_COUNT = 40;
  const surfaceDots = Array.from({ length: DOT_COUNT }).map((_, i) => {
    // Fibonacci-like distribution for even coverage.
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (i / (DOT_COUNT - 1)) * 2; // -1..1
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    // Project to the 260px globe (radius 122 leaves room inside the 260px circle).
    const R = 122;
    const px = x * R;
    const py = -y * R; // invert y (screen down is +y, sphere up is +y)
    // Shrink/clip dots that are on the far side of the sphere.
    const facing = z; // -1 (back) .. 1 (front)
    const scale = 0.55 + Math.max(0, facing) * 0.55;
    const opacity = 0.35 + Math.max(0, facing) * 0.65;
    return { px, py, scale, opacity, delay: -(i * 0.35) % 2.4 };
  });

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
              <clipPath id="globeClip">
                <circle cx="100" cy="100" r="94" />
              </clipPath>
            </defs>

            {/* Grid clipped to the sphere so it reads as a globe, not floating ellipses */}
            <g clipPath="url(#globeClip)">
              {/* Meridians — ellipses centered on cx=100 with decreasing rx. */}
              {[0, 30, 60, 90, 120, 150, 180].map((deg) => {
                const angle = (deg - 90) * (Math.PI / 180);
                const rx = Math.round(Math.abs(Math.cos(angle)) * 92);
                return (
                  <ellipse
                    key={`m-${deg}`}
                    cx="100"
                    cy="100"
                    rx={Math.max(2, rx)}
                    ry="92"
                    fill="none"
                    stroke="rgba(79,70,229,0.32)"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                  />
                );
              })}
              {/* Parallels — horizontal ellipses. */}
              {[40, 60, 80, 120, 140, 160].map((cy) => {
                const dy = Math.abs(100 - cy);
                const rx = Math.round(Math.sqrt(Math.max(0, 92 * 92 - dy * dy)));
                return (
                  <ellipse
                    key={`p-${cy}`}
                    cx="100"
                    cy={cy}
                    rx={rx}
                    ry={Math.max(2.5, rx * 0.18)}
                    fill="none"
                    stroke="rgba(79,70,229,0.28)"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                  />
                );
              })}
              {/* Equator slightly emphasized */}
              <ellipse
                cx="100"
                cy="100"
                rx="92"
                ry="6"
                fill="none"
                stroke="rgba(79,70,229,0.45)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
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
            </g>

            {/* Shading overlay */}
            <circle cx="100" cy="100" r="94" fill="url(#globeShade)" pointerEvents="none" />
            {/* Outline */}
            <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(79,70,229,0.45)" strokeWidth="1.5" />
          </svg>

          {/* Rotating surface dots (evenly distributed on the sphere) */}
          <div className="globe-surface-dots">
            {surfaceDots.map((d, i) => (
              <span
                key={i}
                className="surface-dot"
                style={{
                  left: `calc(50% + ${d.px}px)`,
                  top: `calc(50% + ${d.py}px)`,
                  animationDelay: `${d.delay}s`,
                  opacity: d.opacity,
                  // Use width/height scaling instead of transform so the pulse
                  // keyframe can still transform without fighting us.
                  width: `${4 * d.scale}px`,
                  height: `${4 * d.scale}px`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Reflection highlight */}
        <div className="globe-highlight" />
      </div>

      {/* Orbit rings + flying profile chips */}
      <div className="globe-orbits">
        {orbits.map((o, i) => {
          const size = 140 + o.ring * 2;
          const direction = o.direction < 0 ? "orbitSpinAlt" : "orbitSpin";
          return (
            <div
              key={i}
              className="orbit-ring"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                top: `calc(50% - ${size / 2}px)`,
                left: `calc(50% - ${size / 2}px)`,
                // Each ring gets its own tilt and spin speed/direction via CSS vars.
                "--tilt-x": `${o.tiltX}deg`,
                "--tilt-y": `${o.tiltY}deg`,
                animationName: direction,
                animationDuration: `${o.duration}s`,
                animationDelay: `${o.delay}s`,
              }}
            >
              <span
                className="orbit-dot"
                style={{
                  width: `${o.size + 14}px`,
                  height: `${o.size + 14}px`,
                  background: o.color,
                  color: "#fff",
                  // Re-apply the per-orbit tilt to the dot in REVERSE so the
                  // chip stays upright while it circles the globe.
                  "--counter-tilt": `rotateY(${-o.tiltY}deg) rotateX(${-o.tiltX}deg)`,
                }}
              >
                <span
                  className="orbit-dot-inner"
                  style={{
                    boxShadow: `0 8px 20px -6px ${o.color}99, 0 0 0 3px rgba(255,255,255,0.9)`,
                  }}
                >
                  {o.label}
                </span>
              </span>
            </div>
          );
        })}
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

      {/* Tiny floating connection lines; rotation preserved through the keyframe */}
      <span className="spark s1" style={{ "--r": "-20deg" }} />
      <span className="spark s2" style={{ "--r": "35deg" }} />
      <span className="spark s3" style={{ "--r": "-12deg" }} />
    </div>
  );
}
