import { useEffect, useRef, useState, useCallback } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin } from "lucide-react";

const SOUTH_FLORIDA_AIRPORTS = [
  { code: "FLL", name: "Fort Lauderdale-Hollywood International", address: "100 Terminal Dr, Fort Lauderdale, FL 33315" },
  { code: "MIA", name: "Miami International Airport", address: "2100 NW 42nd Ave, Miami, FL 33142" },
  { code: "PBI", name: "Palm Beach International Airport", address: "1000 James L Turnage Blvd, West Palm Beach, FL 33406" },
];

let loaderInstance: Loader | null = null;
let loadedPromise: Promise<typeof google> | null = null;

function getLoader(): Promise<typeof google> {
  if (!loaderInstance) {
    loaderInstance = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
      version: "weekly",
      libraries: ["places"],
    });
  }
  if (!loadedPromise) {
    loadedPromise = loaderInstance.load();
  }
  return loadedPromise;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function PlacesAutocomplete({ value, onChange, placeholder, className, id }: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;

    getLoader().then(() => {
      if (!inputRef.current) return;
      autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "us" },
        fields: ["formatted_address", "name"],
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(24.5, -81.0),
          new google.maps.LatLng(27.5, -79.5)
        ),
        strictBounds: false,
      });

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace();
        const addr = place?.formatted_address || place?.name || "";
        if (addr) {
          setInputValue(addr);
          onChange(addr);
          setShowSuggestions(false);
        }
      });
    }).catch(() => {});

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [apiKey]);

  const handleAirportSelect = useCallback((airport: typeof SOUTH_FLORIDA_AIRPORTS[0]) => {
    const val = `${airport.code} - ${airport.name}`;
    setInputValue(val);
    onChange(val);
    setShowSuggestions(false);
  }, [onChange]);

  const matchingAirports = SOUTH_FLORIDA_AIRPORTS.filter(a =>
    !inputValue ||
    a.code.toLowerCase().includes(inputValue.toLowerCase()) ||
    a.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {showSuggestions && matchingAirports.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-[#0a0a0a] border border-white/20 shadow-xl">
          <div className="px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground border-b border-white/10">
            South Florida Airports
          </div>
          {matchingAirports.map(airport => (
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
