import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: "too_many_requests",
    message:
      "Has superado el límite de intentos. Por favor espera antes de intentarlo de nuevo.",
    retryAfter: Math.ceil(
      Number(res.getHeader("Retry-After") ?? 60)
    ),
  });
}

// Global safety net: 300 req/min per IP across all routes
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Auth: login — 10 attempts / 15 min per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Auth: register — 5 per hour per IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Auth: OTP send — 3 per 10 min per IP (Twilio cost protection)
export const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Auth: forgot-password — 3 per hour per IP (email cost protection)
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Auth: reset-password — 5 per hour per IP
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Payments: create-intent — 10 per 10 min per IP (Stripe cost protection)
export const paymentIntentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Payments: confirm / tip — 5 per 10 min per IP
export const paymentActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Payments: invoice — 3 per 10 min per IP
export const invoiceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Quote: 30 per min per IP (Google Maps cost protection)
export const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Autocomplete: 60 per min per IP (Google Places cost protection)
export const autocompleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Bookings: create — 20 per 10 min per IP
export const createBookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Support: create ticket — 5 per 10 min per IP
export const createSupportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Support: messages — 20 per 10 min per IP
export const supportMessageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Admin: test email — 3 per hour per IP
export const adminTestEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Admin: send weekly payouts — 1 per hour per IP (prevents double-fire)
export const adminPayoutsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
