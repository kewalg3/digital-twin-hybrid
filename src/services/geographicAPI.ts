interface LocationData {
  city: string;
  state: string;
  country: string;
  formatted: string;
}

interface LocationSuggestion {
  display_name: string;
  place_id: string;
  lat: string;
  lon: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    province?: string;
    country?: string;
    country_code?: string;
  };
}

class GeographicAPI {
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';

  async searchLocations(query: string): Promise<LocationData[]> {
    if (!query || query.length < 3) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch location data');
      }

      const data: LocationSuggestion[] = await response.json();

      return data.map(item => {
        const city = item.address.city || item.address.town || item.address.village || '';
        const state = item.address.state || item.address.province || '';
        const country = item.address.country || '';

        return {
          city,
          state,
          country,
          formatted: this.formatLocation(city, state, country)
        };
      }).filter(location => location.city || location.state || location.country);

    } catch (error) {
      console.error('Error fetching location data:', error);
      return [];
    }
  }

  async validateLocation(location: string): Promise<LocationData | null> {
    const results = await this.searchLocations(location);
    return results.length > 0 ? results[0] : null;
  }

  private formatLocation(city: string, state: string, country: string): string {
    const parts = [city, state, country].filter(Boolean);
    return parts.join(', ');
  }

  // Debounced search function
  debounceSearch = this.debounce(this.searchLocations.bind(this), 300);

  private debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
      return new Promise((resolve) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => resolve(func(...args)), wait);
      });
    };
  }
}

export const geographicAPI = new GeographicAPI();
export type { LocationData };