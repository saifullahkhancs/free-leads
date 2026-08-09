import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";
import LeadDetailModal from "../components/LeadDetailModal";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);

  const fetchLeads = async (newSearch = false) => {
// ... existing fetchLeads logic ...
    setLoading(true);
    setError(null);
    try {
      const searchCursor = newSearch ? null : nextCursor;
      const response = await api.getLeads({ q, cursor: searchCursor });
      if (newSearch) {
        setLeads(response.data.leads);
      } else {
        setLeads((prev) => [...prev, ...response.data.leads]);
      }
      setNextCursor(response.data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads(true);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLeads(true);
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await api.getLeads({ 
            lat: latitude, 
            lon: longitude, 
            radius: 50000 // 50km
          });
          setLeads(response.data.leads);
          setNextCursor(response.data.nextCursor);
          setQ(""); // Clear text search
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        setError("Could not get your location. Please check permissions.");
      }
    );
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchLeads(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div>
          <h1>Leads Directory</h1>
          <p>Logged in as {user?.firstName} ({user?.roles?.join(", ")})</p>
        </div>
        <button onClick={logout} className="auth-submit-btn" style={{ maxWidth: 150 }}>
          Log out
        </button>
      </header>

      <section className="search-section" style={{ marginBottom: "30px" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Search leads (name, company, headline)..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <button type="submit" className="auth-submit-btn" style={{ maxWidth: 100, margin: 0 }}>
            Search
          </button>
          <button 
            type="button" 
            onClick={handleNearMe} 
            className="auth-submit-btn" 
            style={{ maxWidth: 150, margin: 0, backgroundColor: "#28a745" }}
          >
            📍 Near Me
          </button>
        </form>
      </section>

      {error && <div style={{ color: "red", marginBottom: "20px" }}>Error: {error}</div>}

      <section className="leads-list">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "12px" }}>Name</th>
              <th style={{ padding: "12px" }}>Company</th>
              <th style={{ padding: "12px" }}>Industry</th>
              <th style={{ padding: "12px" }}>Location</th>
              <th style={{ padding: "12px" }}>Email</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr 
                key={lead.id} 
                style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                onClick={() => setSelectedLead(lead)}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f5faff"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <td style={{ padding: "12px" }}>
                  <strong>{lead.full_name}</strong>
                  <div style={{ fontSize: "0.85em", color: "#666" }}>{lead.headline}</div>
                </td>
                <td style={{ padding: "12px" }}>{lead.company_name}</td>
                <td style={{ padding: "12px" }}>{lead.industry}</td>
                <td style={{ padding: "12px" }}>
                  {[lead.city_name, lead.region_name, lead.country_name].filter(Boolean).join(", ")}
                </td>
                <td style={{ padding: "12px" }}>
                  {lead.email || <span style={{ color: "#999" }}>Hidden</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && <div style={{ textAlign: "center", padding: "20px" }}>Loading leads...</div>}
        
        {!loading && leads.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
            No leads found.
          </div>
        )}

        {nextCursor && !loading && (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button onClick={handleLoadMore} className="auth-submit-btn" style={{ maxWidth: 200 }}>
              Load More
            </button>
          </div>
        )}
      </section>

      {selectedLead && (
        <LeadDetailModal 
          lead={selectedLead} 
          onClose={() => setSelectedLead(null)} 
        />
      )}
    </div>
  );
}
