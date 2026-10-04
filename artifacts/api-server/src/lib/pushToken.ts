export function isExpoPushToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}
