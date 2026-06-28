import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { API_BASE } from "@/lib/constants";

const SOCIAL_KEYS = ["social_instagram_url", "social_facebook_url", "social_google_profile_url"] as const;

// Augments the static LocalBusiness JSON-LD in index.html (same @id) with admin-configured
// social/profile links once they're set — JSON-LD consumers merge nodes sharing an @id.
export function BusinessSameAs() {
  const [sameAs, setSameAs] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/settings/public`)
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setSameAs(SOCIAL_KEYS.map(key => data[key]).filter((url): url is string => !!url));
      })
      .catch(() => {});
  }, []);

  if (sameAs.length === 0) return null;

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "@id": "https://www.royalmidnight.com/#business",
          sameAs,
        })}
      </script>
    </Helmet>
  );
}
