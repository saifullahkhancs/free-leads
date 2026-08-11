const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");
const googleService = require("../services/googleService");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.REFRESH_COOKIE_SECURE,
  sameSite: "strict",
  path: "/api/auth", // only sent to auth endpoints that need it
  maxAge: env.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res, token) {
  res.cookie(env.REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res) {
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path });
}

function requestMeta(req) {
  return { userAgent: req.headers["user-agent"], ip: req.ip };
}

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  res.status(201).json(result);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body);
  res.status(200).json(result);
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body);
  res.status(200).json(result);
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, requestMeta(req));
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ access_token: accessToken, token_type: "bearer", user });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (!token) throw new ApiError(401, "Missing refresh token");

  const { accessToken, refreshToken } = await authService.refresh({ refreshToken: token }, requestMeta(req));
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ access_token: accessToken, token_type: "bearer" });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  await authService.logout({ refreshToken: token });
  clearRefreshCookie(res);
  res.status(200).json({ message: "Logged out successfully" });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body, requestMeta(req));
  res.status(200).json(result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  res.status(200).json(result);
});

const googleUrl = asyncHandler(async (req, res) => {
  if (!googleService.isConfigured()) {
    throw new ApiError(503, "Google Sign-In is not configured");
  }
  const url = await googleService.getAuthUrl();
  res.status(200).json({ url });
});

const googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) throw new ApiError(400, "Missing code or state");

  // CSRF defense: the state nonce must match one we issued.
  const stateOk = await googleService.verifyState(state);
  if (!stateOk) throw new ApiError(400, "Invalid OAuth state");

  const tokens = await googleService.exchangeCode(code);
  const profile = await googleService.getUserInfo(tokens.access_token);

  const { user, accessToken, refreshToken } = await authService.googleLogin(
    {
      googleId: profile.sub,
      email: profile.email,
      firstName: profile.given_name,
      lastName: profile.family_name,
    },
    requestMeta(req)
  );

  setRefreshCookie(res, refreshToken);
  res.status(200).json({ access_token: accessToken, token_type: "bearer", user });
});

const getMe = asyncHandler(async (req, res) => {
  const profile = await authService.getCurrentUser(req.user.id);
  res.status(200).json(profile);
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await authService.updateProfile(req.user.id, req.body);
  res.status(200).json(profile);
});

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  googleUrl,
  googleCallback,
  getMe,
  updateMe,
};
