import { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MapPin } from "lucide-react";

const SOUTH_FLORIDA_AIRPORTS = [
  { code: "FLL", name: "Fort Lauderdale-Hollywood International", address: "100 Terminal Dr, Fort Lauderdale, FL 33315" },
  { code: "MIA", name: "Miami International Airport", address: "2100 NW 42nd Ave, Miami, FL 33142" },
  { code: "PBI", name: "Palm Beach International Airport", address: "1000 James L Turnage Blvd, West Palm Beach, FL 33406" },
];

let mapsInitialized = false;

function initMaps() {
  if (!mapsInitialized) {
    setOptions({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
      version: "weekly",
    });
    mapsInitialized = true;
  }
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function PlacesAutocomplete({ value, onChange, placeholder, className, id }: PlacesAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const [showAirports, setShowAirports] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;

    initMaps();

    importLibrary("places").then(() => {
      if (!containerRef.current || elementRef.current) return;

      const el = document.createElement("gmp-place-autocomplete") as HTMLElement;
      el.setAttribute("placeholder", placeholder || "");
      el.setAttribute("country", "us");
      el.style.width = "100%";
      el.style.height = "48px";
      el.style.display = "block";

      // Style via CSS custom properties for the shadow DOM
      el.style.setProperty("--gmpx-color-surface", "rgba(255,255,255,0.04)");
      el.style.setProperty("--gmpx-color-on-surface", "#ffffff");
      el.style.setProperty("--gmpx-color-on-surface-variant", "rgba(255,255,255,0.5)");
      el.style.setProperty("--gmpx-color-primary", "#c9a84c");
      el.style.setProperty("--gmpx-font-family-base", "Inter, system-ui, sans-serif");
      el.style.setProperty("--gmpx-font-size-base", "14px");

      el.addEventListener("gmp-placeselect", (e: Event) => {
        const event = e as CustomEvent;
        const place = event.detail?.place as google.maps.places.Place | undefined;
        if (!place) return;
        place.fetchFields({ fields: ["displayName", "formattedAddress"] }).then(() => {
          const addr = place.formattedAddress || place.displayName || "";
          setInputValue(addr);
          onChange(addr);
          setShowAirports(false);
        });
      });

      containerRef.current.appendChild(el);
      elementRef.current = el;
    }).catch(() => {});

    return () => {
      if (elementRef.current && containerRef.current?.contains(elementRef.current)) {
        containerRef.current.removeChild(elementRef.current);
        elementRef.current = null;
      }
    };
  }, [apiKey]);

  const handleAirportSelect = useCallback((airport: typeof SOUTH_FLORIDA_AIRPORTS[0]) => {
    const val = `${airport.code} - ${airport.name}`;
    setInputValue(val);
    onChange(val);
    setShowAirports(false);
  }, [onChange]);

  // Fallback plain input when no API key
  if (!apiKey) {
    return (
      <input
        id={id}
        value={inputValue}
        onChange={e => { setInputValue(e.target.value); onChange(e.target.value); }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
    );
  }

  return (
    <div className="relative">
      {/* Airport shortcuts shown above autocomplete on focus */}
      <div
        className="relative"
        onFocus={() => setShowAirports(true)}
        onBlur={() => setTimeout(() => setShowAirports(false), 200)}
      >
        <div
          ref={containerRef}
          id={id}
          className="w-full [&>gmp-place-autocomplete]:block"
          style={{ minHeight: "48px" }}
        />
      </div>

      {showAirports && (
        <div className="absolute z-50 top-full left-0 right-0 bg-[#0a0a0a] border border-white/20 shadow-xl">
          <div className="px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground border-b border-white/10">
            South Florida Airports
          </div>
          {SOUTH_FLORIDA_AIRPORTS.map(airport => (
            <button
              key={airport.code}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-3 hover:bg-white/5 text-left transition-colors"
              onMouseDown={() => handleAirportSelect(airport)}
            >
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">{airport.code} — {airport.name}</div>
                <div className="text-xs text-muted-foreground">{airport.address}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
