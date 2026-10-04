export type SupportAuthorRole = "admin" | "driver" | "passenger";

export function supportAuthorRole(userRole: string): SupportAuthorRole {
  if (userRole === "admin") return "admin";
  if (userRole === "driver") return "driver";
  return "passenger";
}
