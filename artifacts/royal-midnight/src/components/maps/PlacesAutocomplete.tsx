import { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MapPin, Loader2 } from "lucide-react";

const AIRPORTS = [
  { code: "FLL", name: "Fort Lauderdale-Hollywood International", address: "100 Terminal Dr, Fort Lauderdale, FL 33315" },
  { code: "MIA", name: "Miami International Airport", address: "2100 NW 42nd Ave, Miami, FL 33142" },
  { code: "PBI", name: "Palm Beach International Airport", address: "1000 James L Turnage Blvd, West Palm Beach, FL 33406" },
];

let mapsReady = false;
let mapsReadyPromise: Promise<void> | null = null;
let sessionToken: google.maps.places.AutocompleteSessionToken | null = null;

function ensureMaps(): Promise<void> {
  if (mapsReady) return Promise.resolve();
  if (mapsReadyPromise) return mapsReadyPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.resolve();

  setOptions({ apiKey, version: "weekly" });

  mapsReadyPromise = importLibrary("places").then(() => {
    mapsReady = true;
  });

  return mapsReadyPromise;
}

function getSessionToken(): google.maps.places.AutocompleteSessionToken {
  if (!sessionToken) {
    sessionToken = new google.maps.places.AutocompleteSessionToken();
  }
  return sessionToken;
}

function resetSessionToken() {
  sessionToken = null;
}

interface Suggestion {
  text: string;
  placeId: string;
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
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!apiKey || query.length < 2) {
      setSuggestions([]);
      return;
    }
    await ensureMaps();
    if (!mapsReady) return;

    setLoading(true);
    try {
      const { AutocompleteSuggestion } = google.maps.places as any;
      const request = {
        input: query,
        sessionToken: getSessionToken(),
        includedRegionCodes: ["us"],
        locationBias: {
          rectangle: {
            low: { lat: 24.5, lng: -81.0 },
            high: { lat: 27.5, lng: -79.5 },
          },
        },
      };
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setSuggestions(
        (results || []).slice(0, 5).map((s: any) => ({
          text: s.placePrediction?.text?.toString() || s.placePrediction?.mainText?.toString() || "",
          placeId: s.placePrediction?.placeId || "",
        }))
      );
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 280);
  };

  const handleSelectSuggestion = useCallback(async (suggestion: Suggestion) => {
    setInputValue(suggestion.text);
    onChange(suggestion.text);
    setSuggestions([]);
    setShowDropdown(false);
    resetSessionToken();
  }, [onChange]);

  const handleSelectAirport = useCallback((airport: typeof AIRPORTS[0]) => {
    const val = `${airport.code} - ${airport.name}`;
    setInputValue(val);
    onChange(val);
    setShowDropdown(false);
    setSuggestions([]);
  }, [onChange]);

  const matchingAirports = AIRPORTS.filter(a =>
    !inputValue ||
    a.code.toLowerCase().includes(inputValue.toLowerCase()) ||
    a.name.toLowerCase().includes(inputValue.toLowerCase()) ||
    inputValue.toLowerCase().includes(a.code.toLowerCase())
  );

  const showAirports = focused && matchingAirports.length > 0 && suggestions.length === 0;
  const hasDropdown = showDropdown && (showAirports || suggestions.length > 0 || loading);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => { setFocused(true); setShowDropdown(true); }}
          onBlur={() => setTimeout(() => { setFocused(false); setShowDropdown(false); }, 180)}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary pointer-events-none" />
        )}
      </div>

      {hasDropdown && (
        <div className="absolute z-[200] top-full left-0 right-0 bg-[#0a0a0a] border border-white/15 shadow-2xl max-h-72 overflow-y-auto">

          {/* Airport shortcuts */}
          {showAirports && (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/8 bg-white/2">
                South Florida Airports
              </div>
              {matchingAirports.map(airport => (
                <button
                  key={airport.code}
                  type="button"
                  className="w-full flex items-start gap-3 px-3 py-3 hover:bg-white/6 text-left transition-colors border-b border-white/5 last:border-0"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectAirport(airport); }}
                >
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-white">{airport.code} — {airport.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{airport.address}</div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Google Places suggestions */}
          {suggestions.length > 0 && (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/8 bg-white/2">
                Addresses
              </div>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/6 text-left transition-colors border-b border-white/5 last:border-0"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                >
                  <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="text-sm text-white">{s.text}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
