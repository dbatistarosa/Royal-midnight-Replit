import rateLimit from "express-rate-limit";

const json429 = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(429).json({ error: "Too many requests. Please try again later." });

/** OTP send: max 3 per phone per 15 min (keyed by body.phone) */
export const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body?.phone as string | undefined) ?? req.ip ?? "unknown",
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});

/** OTP verify: max 5 attempts per phone per 10 min */
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req.body?.phone as string | undefined) ?? req.ip ?? "unknown",
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Password reset: max 5 per IP per 15 min */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Payment intent creation: max 10 per IP per minute */
export const paymentIntentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Quote endpoint: max 30 per IP per minute */
export const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Public driver endpoint: max 60 per IP per minute */
export const publicDriverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: json429,
  standardHeaders: true,
  legacyHeaders: false,
});
