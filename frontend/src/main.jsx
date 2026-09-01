import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.jsx";

/* Stylesheet order matters:
   1. theme.css       — global :root tokens + reset (must be first so every
                        var() below resolves, in any scope)
   2. design systems  — auth / landing / dashboard / app
   3. site-*.css      — the shared header + shell, loaded last so the single
                        menu bar always wins over legacy rules */
import "./styles/theme.css";
import "./styles/auth.css";
import "./styles/landing.css";
import "./styles/landing-cards.css";
import "./styles/globe.css";
import "./styles/dashboard.css";
import "./styles/lead-management.css";
import "./styles/app.css";
import "./styles/site-layout.css";
import "./styles/site-header.css";
import "./styles/app-theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <App />
    <Analytics />
    <SpeedInsights />
  </>
);
