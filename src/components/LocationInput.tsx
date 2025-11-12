import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { geographicAPI, LocationData } from "@/services/geographicAPI";
import { MapPin } from "lucide-react";

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function LocationInput({ value, onChange, placeholder = "Enter location", className }: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<LocationData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const searchLocations = async () => {
      if (value.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        const results = await geographicAPI.debounceSearch(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (error) {
        console.error('Error searching locations:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    };

    searchLocations();
  }, [value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSuggestionClick = (suggestion: LocationData) => {
    onChange(suggestion.formatted);
    setShowSuggestions(false);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && value.length >= 3) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        className={className}
      />

      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-2 text-sm text-muted-foreground">
              Searching locations...
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="w-full text-left p-2 hover:bg-muted transition-colors flex items-center gap-2 text-sm"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span>{suggestion.formatted}</span>
              </button>
            ))
          )}

          {!isLoading && suggestions.length === 0 && value.length >= 3 && (
            <div className="p-2 text-sm text-muted-foreground">
              No locations found
            </div>
          )}
        </div>
      )}
    </div>
  );
}