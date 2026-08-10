import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Crosshair,
  Loader2,
  LogIn,
  MapPin,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api/client";

// Custom pin so we don't depend on Leaflet's default image assets.
const PIN_ICON = L.divIcon({
  className: "fl-pin",
  html: `
    <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 1C8.2 1 1 8.1 1 16.7 1 28.4 17 41 17 41s16-12.6 16-24.3C33 8.1 25.8 1 17 1Z"
        fill="#1d4b3f" stroke="#ffffff" stroke-width="2"/>
      <circle cx="17" cy="16.5" r="5.5" fill="#c9f269"/>
    </svg>`,
  iconSize: [34, 42],
  iconAnchor: [17, 41],
  popupAnchor: [0, -40],
});

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchTimerRef = useRef(null);

  const [form, setForm] = useState({ firstName: "", lastName: "" });
  const [location, setLocation] = useState(null); // { lat, lng, city, region, country, label }
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Sync form + saved location from the auth context once it's loaded
  useEffect(() => {
    if (!user) return;
    setForm({ firstName: user.firstName || "", lastName: user.lastName || "" });
    if (user.location && user.location.lat != null && user.location.lng != null) {
      setLocation(user.location);
    }
  }, [user]);

  const setMarker = useCallback((lat, lng) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { icon: PIN_ICON, draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", (e) => {
        const { lat: mlat, lng: mlng } = e.target.getLatLng();
        placePin(mlat, mlng);
      });
    }
  }, []);

  // Reverse-geocode the picked point -> city / region / country auto-filled
  const placePin = useCallback(async (lat, lng) => {
    setLocation({ lat, lng, city: null, region: null, country: null, label: null });
    setReverseLoading(true);
    try {
      const info = await api.geoReverse(lat, lng);
      setLocation((prev) => ({
        lat,
        lng,
        city: info.city || null,
        region: info.region || null,
        country: info.country || null,
        label: info.label || null,
      }));
    } catch {
      setError("Could not fetch area info for this spot — you can still save the coordinates.");
    } finally {
      setReverseLoading(false);
    }
  }, []);

  const handleSelectResult = useCallback(
    (r) => {
      setQuery(r.label || "");
      setResults([]);
      setShowResults(false);
      mapRef.current?.flyTo([r.lat, r.lng], 13, { duration: 0.8 });
      setMarker(r.lat, r.lng);
      setLocation({
        lat: r.lat,
        lng: r.lng,
        city: r.city || null,
        region: r.region || null,
        country: r.country || null,
        label: r.label || null,
      });
    },
    [setMarker]
  );

  // Debounced place search
  const handleSearchChange = (value) => {
    setQuery(value);
    setSaved(false);
    clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.geoSearch(value);
        setResults(res || []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const useMyLocation = () => {
    setSaved(false);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo([latitude, longitude], 13, { duration: 0.8 });
        setMarker(latitude, longitude);
        placePin(latitude, longitude);
      },
      () => setError("Could not access your location. Allow location access or search instead.")
    );
  };

  const clearLocation = () => {
    setLocation(null);
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    setQuery("");
    setResults([]);
    setSaved(false);
  };

  // Init map once
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;
    const map = L.map(mapElRef.current, {
      center: [30.0, 0.0],
      zoom: 2,
      worldCopyJump: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on("click", (e) => {
      setSaved(false);
      placePin(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Center map on the user's saved location once available
  useEffect(() => {
    if (mapRef.current && location && location.lat != null && location.lng != null) {
      mapRef.current.setView([location.lat, location.lng], 12);
      setMarker(location.lat, location.lng);
    }
  }, [location?.lat, location?.lng, setMarker]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        // If no location was picked, explicitly clear any saved one.
        location: location
          ? {
              lat: location.lat,
              lng: location.lng,
              city: location.city,
              region: location.region,
              country: location.country,
              label: location.label,
            }
          : { lat: null, lng: null, city: null, region: null, country: null, label: null },
      };
      await api.updateProfile(payload);
      await refreshUser();
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-card profile-login-prompt">
          <MapPin size={28} />
          <h2>Log in to manage your profile</h2>
          <p>Save your name and pick your exact location on the map.</p>
          <Link to="/login" className="app-header-btn app-header-btn-primary">
            <LogIn size={15} /> Log in
          </Link>
        </div>
      </div>
    );
  }

  const areaSummary = [location?.city, location?.region, location?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="profile-page">
      <div className="profile-heading">
        <h1>My Profile</h1>
        <p>Update your details — pick your exact location on the map and the city, province and country are filled in automatically.</p>
      </div>

      {saved && (
        <div className="profile-toast">
          <Save size={15} /> Profile updated successfully
        </div>
      )}
      {error && (
        <div className="profile-toast error">
          <X size={15} /> {error}
        </div>
      )}

      <div className="profile-grid">
        {/* ---- Left: account details ---- */}
        <form className="profile-card" onSubmit={handleSave}>
          <h2>Account details</h2>

          <label className="fl-field">
            <span>First name</span>
            <input
              type="text"
              value={form.firstName}
              maxLength={150}
              required
              onChange={(e) => {
                setForm((f) => ({ ...f, firstName: e.target.value }));
                setSaved(false);
              }}
            />
          </label>

          <label className="fl-field">
            <span>Last name</span>
            <input
              type="text"
              value={form.lastName}
              maxLength={150}
              required
              onChange={(e) => {
                setForm((f) => ({ ...f, lastName: e.target.value }));
                setSaved(false);
              }}
            />
          </label>

          <label className="fl-field">
            <span>Email (cannot be changed)</span>
            <input type="email" value={user.email} disabled />
          </label>

          <div className="fl-location-summary">
            <MapPin size={16} />
            <div>
              <span className="fl-location-summary-title">Saved location</span>
              {location && location.lat != null ? (
                <>
                  <strong>{areaSummary || "Selected coordinates"}</strong>
                  <small>
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </small>
                  {location.label && <small className="fl-location-label">{location.label}</small>}
                </>
              ) : (
                <small>No location set yet — pick one on the map.</small>
              )}
            </div>
          </div>

          <button type="submit" className="fl-save-btn" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>

        {/* ---- Right: map picker ---- */}
        <div className="profile-card profile-map-card">
          <h2>Your location</h2>

          <div className="fl-search-row">
            <div className="fl-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search city or area… e.g. Lahore"
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => results.length && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
              />
              {searching && <Loader2 size={15} className="spin" />}
              {showResults && results.length > 0 && (
                <div className="fl-search-results">
                  {results.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="fl-search-result"
                      onMouseDown={() => handleSelectResult(r)}
                    >
                      <MapPin size={14} />
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="fl-locate-btn" onClick={useMyLocation} title="Use my current location">
              <Crosshair size={16} />
              <span>My location</span>
            </button>
          </div>

          <div className="fl-map" ref={mapElRef} />

          <div className="fl-map-hint">
            <MapPin size={14} />
            <span>
              Click anywhere on the map or drag the pin to set your exact spot.
              {reverseLoading && (
                <>
                  {" "}
                  <Loader2 size={12} className="spin inline" /> Fetching area info…
                </>
              )}
            </span>
          </div>

          <div className="fl-map-actions">
            <div className="fl-map-detected">
              <MapPin size={15} />
              {location && location.lat != null ? (
                <span>
                  {areaSummary || "Pin dropped"}
                  {location.countryCode ? ` (${location.countryCode})` : ""}
                </span>
              ) : (
                <span>No pin yet</span>
              )}
            </div>
            {location && location.lat != null && (
              <button type="button" className="fl-clear-btn" onClick={clearLocation}>
                <Trash2 size={14} /> Clear location
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="fl-attribution">
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors ·
        Geocoding by <a href="https://nominatim.org" target="_blank" rel="noreferrer">Nominatim</a> — free, no API key required
      </p>
    </div>
  );
}
