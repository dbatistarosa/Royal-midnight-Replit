export function needsPrivateSigning(profilePicture: string | null | undefined): boolean {
  if (!profilePicture) return false;
  if (/^https?:\/\//i.test(profilePicture)) return false;
  return !/[?&]sig=/.test(profilePicture);
}
