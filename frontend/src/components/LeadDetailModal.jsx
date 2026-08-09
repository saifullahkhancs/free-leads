import React from "react";

export default function LeadDetailModal({ lead, onClose }) {
  if (!lead) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: "white",
        padding: "30px",
        borderRadius: "8px",
        maxWidth: "600px",
        width: "90%",
        maxHeight: "90vh",
        overflowY: "auto",
        position: "relative"
      }}>
        <button 
          onClick={onClose}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            border: "none",
            background: "none",
            fontSize: "20px",
            cursor: "pointer"
          }}
        >
          ×
        </button>

        <h2 style={{ marginBottom: "5px" }}>{lead.full_name}</h2>
        <div style={{ color: "#666", marginBottom: "20px" }}>{lead.headline}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
          <div>
            <strong>Company:</strong>
            <div>{lead.company_name}</div>
          </div>
          <div>
            <strong>Job Title:</strong>
            <div>{lead.job_title}</div>
          </div>
          <div>
            <strong>Industry:</strong>
            <div>{lead.industry}</div>
          </div>
          <div>
            <strong>Location:</strong>
            <div>{[lead.city_name, lead.region_name, lead.country_name].filter(Boolean).join(", ")}</div>
          </div>
        </div>

        <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f9f9f9", borderRadius: "4px" }}>
          <h4 style={{ marginTop: 0 }}>Contact Information</h4>
          <div style={{ marginBottom: "10px" }}>
            <strong>Email:</strong> {lead.email || <span style={{ color: "#999" }}>Masked (Upgrade to view)</span>}
          </div>
          <div>
            <strong>Social Links:</strong>
            <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
              {lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a> : <span style={{ color: "#999" }}>LinkedIn (Locked)</span>}
              {lead.website_url ? <a href={lead.website_url} target="_blank" rel="noreferrer">Website</a> : <span style={{ color: "#999" }}>Website (Locked)</span>}
            </div>
          </div>
        </div>

        {lead.about && (
          <div>
            <strong>About:</strong>
            <p style={{ lineHeight: "1.5" }}>{lead.about}</p>
          </div>
        )}

        {!lead.about && !lead.linkedin_url && (
          <div style={{ 
            marginTop: "20px", 
            padding: "15px", 
            border: "1px dashed #ccc", 
            textAlign: "center",
            color: "#666"
          }}>
            Unlock full profile, social links, and direct email with a Pro plan.
          </div>
        )}
      </div>
    </div>
  );
}
