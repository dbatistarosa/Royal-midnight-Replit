export * from "./generated/api";
export * from "./generated/types";

// 21 names exist both as zod schemas (generated/api) and as interfaces
// (generated/types). Explicit re-exports resolve the `export *` ambiguity in
// favor of the zod schemas — the runtime values every api-server route imports.
// If you need the interface flavor, import it from "./generated/types" directly.
export {
  CreateAddressBody,
  CreateBookingBody,
  CreateDriverBody,
  CreatePricingRuleBody,
  CreatePromoBody,
  CreateReviewBody,
  CreateTicketBody,
  CreateUserBody,
  CreateVehicleBody,
  LoginBody,
  RegisterBody,
  SendOtpBody,
  UpdateBookingBody,
  UpdateDriverBody,
  UpdatePricingRuleBody,
  UpdatePromoBody,
  UpdateTicketBody,
  UpdateUserBody,
  UpdateVehicleBody,
  ValidatePromoBody,
  VerifyOtpBody,
} from "./generated/api";
