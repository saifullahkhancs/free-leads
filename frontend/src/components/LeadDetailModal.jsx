import { BadgeCheck, Link2, Lock, MapPin, X } from "lucide-react";
import { avatarColor, initialsOf, locationString } from "../utils/format";

export default function LeadDetailModal({ lead, onClose }) {
  if (!lead) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <span className="dash-avatar" style={{ width: 48, height: 48, fontSize: 16, background: avatarColor(lead.full_name) }}>
              {initialsOf(lead)}
            </span>
            <div style={{ minWidth: 0 }}>
              <h2>{lead.full_name}</h2>
              <p>{lead.headline || lead.job_title || "Lead profile"}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-field">
              <label>Company</label>
              <div>{lead.company_name || "—"}</div>
            </div>
            <div className="modal-field">
              <label>Job title</label>
              <div>{lead.job_title || "—"}</div>
            </div>
            <div className="modal-field">
              <label>Industry</label>
              <div>{lead.industry || "—"}</div>
            </div>
            <div className="modal-field">
              <label>Location</label>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={13} /> {locationString(lead) || "Unknown"}
              </div>
            </div>
            <div className="modal-field">
              <label>Email</label>
              <div>{lead.email || "—"}</div>
            </div>
            <div className="modal-field">
              <label>Status</label>
              <div>
                {lead.is_verified ? (
                  <span className="dash-badge badge-green"><BadgeCheck size={11} /> Verified</span>
                ) : (
                  <span className="dash-badge badge-gray">Unverified</span>
                )}
              </div>
            </div>
          </div>

          {lead.about && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, color: "var(--dash-faint)", marginBottom: 6 }}>
                About
              </div>
              <p style={{ margin: 0, lineHeight: 1.65, fontSize: 13.5, color: "var(--dash-ink)" }}>{lead.about}</p>
            </div>
          )}

          <div className="modal-note">
            {lead.linkedin_url || lead.website_url ? <Link2 size={16} /> : <Lock size={16} />}
            <div>
              {lead.linkedin_url || lead.website_url ? (
                <>
                  <strong>Links:</strong>{" "}
                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>LinkedIn</a>
                  )}
                  {lead.linkedin_url && lead.website_url && " · "}
                  {lead.website_url && (
                    <a href={lead.website_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Website</a>
                  )}
                </>
              ) : (
                "Social links are masked on the free tier. Admin and Pro accounts see the full profile."
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
