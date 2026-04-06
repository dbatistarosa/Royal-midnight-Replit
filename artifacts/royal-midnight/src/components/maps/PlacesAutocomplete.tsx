import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, Plane } from "lucide-react";
import { API_BASE } from "@/lib/constants";

interface Airport {
  code: string;
  name: string;
  address: string;
}

interface Suggestion {
  text: string;
  mainText: string;
  secondaryText: string;
  placeId: string;
}

interface AutocompleteResponse {
  airports: Airport[];
  suggestions: Suggestion[];
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState(value);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelectingRef = useRef(false);

  // Sync external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchSuggestions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const url = `${API_BASE}/autocomplete?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network error");
      const data = await res.json() as AutocompleteResponse;
      setAirports(data.airports || []);
      setSuggestions(data.suggestions || []);
    } catch {
      setAirports([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleFocus = () => {
    setShowDropdown(true);
    // Always fetch on focus (even empty = shows airports)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(inputValue), 100);
  };

  const handleBlur = () => {
    // Use a longer delay so touch events can fire first
    setTimeout(() => {
      if (!isSelectingRef.current) {
        setShowDropdown(false);
      }
    }, 300);
  };

  const selectValue = useCallback((text: string) => {
    isSelectingRef.current = true;
    setInputValue(text);
    onChange(text);
    setSuggestions([]);
    setAirports([]);
    setShowDropdown(false);
    // Reset after a short delay
    setTimeout(() => { isSelectingRef.current = false; }, 400);
  }, [onChange]);

  const handleSelectAirport = (airport: Airport) => {
    selectValue(`${airport.code} - ${airport.name}`);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    selectValue(suggestion.text);
  };

  const hasAirports = airports.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const hasContent = hasAirports || hasSuggestions || loading;
  const isOpen = showDropdown && hasContent;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary pointer-events-none" />
      )}

      {isOpen && (
        <div
          className="absolute z-[9999] top-full left-0 right-0 bg-[#0d0d0d] border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden"
          style={{ marginTop: "2px" }}
          onPointerDown={(e) => {
            // Prevent blur when interacting with dropdown
            e.preventDefault();
          }}
        >
          {/* Airport shortcuts */}
          {hasAirports && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10 bg-white/3">
                South Florida Airports
              </div>
              {airports.map(airport => (
                <button
                  key={airport.code}
                  type="button"
                  className="w-full flex items-start gap-3 px-3 py-3 hover:bg-white/8 active:bg-white/12 text-left transition-colors border-b border-white/5 last:border-0 cursor-pointer"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelectAirport(airport);
                  }}
                  onClick={() => handleSelectAirport(airport)}
                >
                  <Plane className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-white">{airport.code} — {airport.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{airport.address}</div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Address suggestions */}
          {hasSuggestions && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10 bg-white/3">
                Addresses
              </div>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full flex items-start gap-3 px-3 py-3 hover:bg-white/8 active:bg-white/12 text-left transition-colors border-b border-white/5 last:border-0 cursor-pointer"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(s);
                  }}
                  onClick={() => handleSelectSuggestion(s)}
                >
                  <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm text-white">{s.mainText}</div>
                    {s.secondaryText && (
                      <div className="text-xs text-gray-500 mt-0.5">{s.secondaryText}</div>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Loading state (no results yet) */}
          {loading && !hasAirports && !hasSuggestions && (
            <div className="px-3 py-4 flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching addresses...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
