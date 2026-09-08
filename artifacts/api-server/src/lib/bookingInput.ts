import { z } from "zod";
import { CreateBookingBody } from "@workspace/api-zod";

/** Reject malformed manifests before pricing or persisting any reservation. */
export const ValidatedBookingBody = CreateBookingBody.extend({
  passengerName: z.string().trim().min(1).max(200),
  passengerEmail: z.string().trim().toLowerCase().email().max(320),
  passengerPhone: z.string().trim().min(3).max(40),
  pickupAddress: z.string().trim().min(1).max(500),
  dropoffAddress: z.string().trim().min(1).max(500),
  pickupAt: z.string().datetime({ offset: true }),
  vehicleClass: z.string().trim().min(1).max(50),
  passengers: z.number().int().min(1).max(20),
  luggageCount: z.number().int().min(0).max(50).default(0),
  userId: z.number().int().positive().nullish(),
  extras: z
    .array(
      z.object({
        id: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .max(20)
    .refine(
      (extras) =>
        new Set(extras.map((extra) => extra.id)).size === extras.length,
      "Duplicate extra services are not allowed",
    )
    .nullish(),
});
