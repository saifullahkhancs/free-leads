import { useMemo } from "react";

/**
 * GlobeAnimation
 *
 * A premium, self-contained hero illustration of a global lead network.
 *
 * Still the same dependency-free CSS/SVG component it always was — it just
 * renders a far more refined composition:
 *   - a translucent 3D digital earth with a dotted world map
 *   - thin orbital connector paths and curved global connection lines
 *   - small glowing nodes on the surface
 *   - 7-9 profile markers (generic white person silhouettes) in the brand
 *     accent colours, each tethered to the globe by a subtle connector
 *
 * The whole thing is transparent-edged: no card, no rectangle, no labels, so
 * it drops straight onto the light hero background.
 */

/* Profile markers. Angles are degrees clockwise from 12 o'clock; radius is a
   fraction of half the composition, so everything scales with the container. */
const MARKERS = [
  { color: "#4F46E5", angle: -28, radius: 0.94, size: 46, delay: 0 },
  { color: "#2563EB", angle: 24, radius: 0.99, size: 42, delay: -1.1 },
  { color: "#06B6D4", angle: 74, radius: 0.9, size: 38, delay: -2.2 },
  { color: "#EC4899", angle: 128, radius: 0.97, size: 42, delay: -0.6 },
  { color: "#7C3AED", angle: 178, radius: 0.88, size: 44, delay: -1.7 },
  { color: "#F59E0B", angle: 224, radius: 0.99, size: 38, delay: -2.8 },
  { color: "#10B981", angle: 272, radius: 0.92, size: 40, delay: -1.4 },
  { color: "#4F46E5", angle: 318, radius: 1.0, size: 36, delay: -0.3 },
];

/* Deterministic pseudo-random so the dotted map is stable between renders. */
function seeded(i) {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Build a dotted "world map" over a sphere: dots are laid out on a lat/long
 * grid, projected orthographically, and kept only where they fall inside one
 * of a few broad landmass blobs. Abstract by design — no country outlines.
 */
function useMapDots() {
  return useMemo(() => {
    // Rough landmass blobs in (long, lat) degrees: [lon, lat, radiusLon, radiusLat]
    const land = [
      [-100, 45, 34, 26], // North America
      [-80, 8, 16, 16], // Central America
      [-60, -18, 20, 26], // South America
      [12, 50, 26, 18], // Europe
      [20, 5, 26, 30], // Africa
      [78, 26, 26, 20], // South / Central Asia
      [110, 42, 30, 20], // East Asia
      [135, -26, 18, 14], // Oceania
    ];

    const inLand = (lon, lat) =>
      land.some(([cl, ca, rl, ra]) => {
        const dl = (lon - cl) / rl;
        const da = (lat - ca) / ra;
        return dl * dl + da * da <= 1;
      });

    const dots = [];
    let i = 0;
    for (let lat = -78; lat <= 78; lat += 6) {
      const latRad = (lat * Math.PI) / 180;
      // Constant surface spacing: fewer longitude steps near the poles.
      const step = 6 / Math.max(0.25, Math.cos(latRad));
      for (let lon = -180; lon < 180; lon += step) {
        i += 1;
        if (!inLand(lon, lat)) continue;
        const lonRad = (lon * Math.PI) / 180;
        // Orthographic projection of a sphere of radius 92 centred at 100,100.
        const x = Math.cos(latRad) * Math.sin(lonRad);
        const y = Math.sin(latRad);
        const z = Math.cos(latRad) * Math.cos(lonRad);
        if (z < 0.06) continue; // back of the globe
        dots.push({
          cx: 100 + x * 92,
          cy: 100 - y * 92,
          // Dots shrink and fade toward the limb for a rounded, 3D read.
          r: 1.05 + z * 0.75,
          o: 0.2 + z * 0.6,
          twinkle: seeded(i) > 0.93,
        });
      }
    }
    return dots;
  }, []);
}

export default function GlobeAnimation() {
  const mapDots = useMapDots();

  /* Glowing network nodes sitting on the globe surface. */
  const nodes = useMemo(
    () => [
      { x: 62, y: 74, c: "#4F46E5" },
      { x: 120, y: 60, c: "#2563EB" },
      { x: 148, y: 104, c: "#06B6D4" },
      { x: 88, y: 132, c: "#7C3AED" },
      { x: 54, y: 116, c: "#EC4899" },
      { x: 132, y: 148, c: "#10B981" },
      { x: 104, y: 92, c: "#4F46E5" },
    ],
    []
  );

  /* Curved great-circle style arcs between surface nodes. */
  const arcs = useMemo(
    () => [
      { d: "M62,74 Q100,40 148,104", delay: 0 },
      { d: "M54,116 Q104,150 148,104", delay: -1.6 },
      { d: "M120,60 Q150,110 132,148", delay: -3.2 },
      { d: "M62,74 Q60,120 88,132", delay: -2.4 },
      { d: "M104,92 Q140,70 148,104", delay: -0.8 },
    ],
    []
  );

  return (
    <div className="globe-wrap" aria-hidden="true">
      {/* Soft radial illumination behind the sphere — no rectangle, no card. */}
      <div className="globe-glow" />

      <div className="globe-stage">
        {/* ---------- The digital earth ---------- */}
        <div className="globe-sphere">
          <svg
            className="globe-svg"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Translucent glass body with a lavender illuminated side. */}
              <radialGradient id="fl-globe-body" cx="34%" cy="28%" r="82%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="42%" stopColor="#EEF0FF" stopOpacity="0.8" />
                <stop offset="78%" stopColor="#D8DCFB" stopOpacity="0.62" />
                <stop offset="100%" stopColor="#BFC6F5" stopOpacity="0.42" />
              </radialGradient>

              {/* Inner shading that darkens the lower-right limb. */}
              <radialGradient id="fl-globe-shade" cx="70%" cy="76%" r="72%">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.16" />
                <stop offset="60%" stopColor="#4F46E5" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
              </radialGradient>

              {/* Top-left specular sheen. */}
              <radialGradient id="fl-globe-sheen" cx="30%" cy="22%" r="42%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>

              <linearGradient id="fl-arc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0" />
                <stop offset="50%" stopColor="#6366F1" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
              </linearGradient>

              <clipPath id="fl-globe-clip">
                <circle cx="100" cy="100" r="93" />
              </clipPath>
            </defs>

            {/* Glass body */}
            <circle cx="100" cy="100" r="93" fill="url(#fl-globe-body)" />

            <g clipPath="url(#fl-globe-clip)">
              {/* Meridians / parallels — thin, dotted, very light */}
              <g className="globe-graticule">
                {[0.28, 0.55, 0.8, 0.96].map((k, i) => (
                  <ellipse
                    key={`m-${i}`}
                    cx="100"
                    cy="100"
                    rx={92 * k}
                    ry="92"
                    fill="none"
                    stroke="rgba(79,70,229,0.20)"
                    strokeWidth="0.7"
                    strokeDasharray="1.5 4"
                  />
                ))}
                {[-58, -30, 0, 30, 58].map((lat) => {
                  const latRad = (lat * Math.PI) / 180;
                  const cy = 100 - Math.sin(latRad) * 92;
                  const rx = Math.cos(latRad) * 92;
                  return (
                    <ellipse
                      key={`p-${lat}`}
                      cx="100"
                      cy={cy}
                      rx={rx}
                      ry={Math.max(2, rx * 0.16)}
                      fill="none"
                      stroke="rgba(79,70,229,0.16)"
                      strokeWidth="0.7"
                      strokeDasharray="1.5 4"
                    />
                  );
                })}
              </g>

              {/* Dotted world map */}
              <g className="globe-map">
                {mapDots.map((d, i) => (
                  <circle
                    key={`d-${i}`}
                    cx={d.cx}
                    cy={d.cy}
                    r={d.r}
                    fill={i % 7 === 0 ? "#2563EB" : "#4F46E5"}
                    opacity={d.o}
                    className={d.twinkle ? "map-dot-twinkle" : undefined}
                    style={d.twinkle ? { animationDelay: `${(i % 9) * 0.4}s` } : undefined}
                  />
                ))}
              </g>

              {/* Curved global connection lines */}
              <g className="globe-arcs" fill="none" strokeLinecap="round">
                {arcs.map((a, i) => (
                  <path
                    key={`a-${i}`}
                    d={a.d}
                    stroke="url(#fl-arc)"
                    strokeWidth="1.1"
                    className="globe-arc"
                    style={{ animationDelay: `${a.delay}s` }}
                  />
                ))}
              </g>

              {/* Small glowing surface nodes */}
              <g className="globe-nodes">
                {nodes.map((n, i) => (
                  <g key={`n-${i}`} style={{ animationDelay: `${-i * 0.7}s` }} className="globe-node">
                    <circle cx={n.x} cy={n.y} r="5.4" fill={n.c} opacity="0.14" />
                    <circle cx={n.x} cy={n.y} r="2.4" fill={n.c} opacity="0.95" />
                  </g>
                ))}
              </g>

              {/* Shading + sheen keep the sphere reading as glass */}
              <circle cx="100" cy="100" r="93" fill="url(#fl-globe-shade)" />
              <circle cx="100" cy="100" r="93" fill="url(#fl-globe-sheen)" />
            </g>

            {/* Rim light */}
            <circle
              cx="100"
              cy="100"
              r="93"
              fill="none"
              stroke="rgba(79,70,229,0.30)"
              strokeWidth="0.9"
            />
          </svg>
        </div>

        {/* ---------- Thin orbital connector paths ---------- */}
        <div className="globe-orbit globe-orbit-a" />
        <div className="globe-orbit globe-orbit-b" />
        <div className="globe-orbit globe-orbit-c" />

        {/* ---------- Connector lines from the globe out to each marker ---------- */}
        <svg className="globe-links" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          {MARKERS.map((m, i) => {
            const rad = ((m.angle - 90) * Math.PI) / 180;
            const x = 100 + Math.cos(rad) * m.radius * 86;
            const y = 100 + Math.sin(rad) * m.radius * 86;
            // Start just outside the sphere edge, end at the marker.
            const sx = 100 + Math.cos(rad) * 66;
            const sy = 100 + Math.sin(rad) * 66;
            return (
              <line
                key={`l-${i}`}
                x1={sx}
                y1={sy}
                x2={x}
                y2={y}
                stroke={m.color}
                strokeWidth="0.6"
                strokeDasharray="2 3"
                opacity="0.42"
                className="globe-link"
                style={{ animationDelay: `${m.delay}s` }}
              />
            );
          })}
        </svg>

        {/* ---------- Profile markers ---------- */}
        {MARKERS.map((m, i) => {
          const rad = ((m.angle - 90) * Math.PI) / 180;
          const left = 50 + Math.cos(rad) * m.radius * 43;
          const top = 50 + Math.sin(rad) * m.radius * 43;
          return (
            <span
              key={`p-${i}`}
              className="globe-marker"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${m.size}px`,
                height: `${m.size}px`,
                background: m.color,
                boxShadow: `0 0 0 4px ${m.color}1f, 0 6px 16px ${m.color}40`,
                animationDelay: `${m.delay}s`,
              }}
            >
              {/* Generic person silhouette — no text, no logo. */}
              <svg viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                <circle cx="12" cy="8.6" r="3.9" />
                <path d="M12 13.6c-4.1 0-7.1 2.3-7.1 5.1 0 .7.5 1.1 1.2 1.1h11.8c.7 0 1.2-.4 1.2-1.1 0-2.8-3-5.1-7.1-5.1z" />
              </svg>
            </span>
          );
        })}
      </div>
    </div>
  );
}
