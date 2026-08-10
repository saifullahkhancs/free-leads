const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const routes = require("./routes");
const { globalLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

// Trust the first proxy hop (needed for req.ip / rate limiting behind Render,
// Vercel, Nginx, etc.)
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    // Explicit allowlist, no wildcard with credentials — Section 6:
    // "CORS misconfiguration ... Explicit allowlist of frontend origins".
    origin: env.CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" })); // 10mb so CSV bulk imports fit in the JSON body
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(globalLimiter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
