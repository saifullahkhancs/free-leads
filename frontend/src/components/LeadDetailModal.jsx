import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { avatarColor, initialsOf, locationString } from "../utils/format";
import { isLeadSaved, saveLead, removeSavedLead } from "../utils/savedLeads";

export default function LeadDetailModal({ lead, onClose, onPrev, onNext }) {
  const [saved, setSaved] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  useEffect(() => {
    if (lead) {
      setSaved(isLeadSaved(lead.id));
    }
  }, [lead]);

  // Keyboard shortcut: Escape to close, Arrow keys for navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onPrev, onNext]);

  if (!lead) return null;

  const handleToggleSave = () => {
    if (saved) {
      removeSavedLead(lead.id);
      setSaved(false);
    } else {
      saveLead(lead);
      setSaved(true);
    }
  };

  const handleCopyEmail = () => {
    if (lead.email) {
      navigator.clipboard.writeText(lead.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const handleCopySummary = () => {
    const summary = `${lead.full_name}\n${lead.job_title || ""} at ${lead.company_name || ""}\nIndustry: ${lead.industry || "N/A"}\nLocation: ${locationString(lead) || "N/A"}\nEmail: ${lead.email || "N/A"}`;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="lead-modal-overlay" onClick={onClose}>
      <div className="lead-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Banner with gradient backdrop */}
        <div className="lead-modal-banner">
          <button className="lead-modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Avatar & Action Header */}
        <div className="lead-modal-header-content">
          <div className="lead-modal-avatar-wrap">
            <div
              className="lead-modal-avatar"
              style={{ background: avatarColor(lead.full_name) }}
            >
              {initialsOf(lead)}
            </div>
          </div>

          <div className="lead-modal-actions">
            {onPrev && (
              <button className="lead-modal-btn" onClick={onPrev} title="Previous Lead">
                <ChevronLeft size={16} />
              </button>
            )}
            {onNext && (
              <button className="lead-modal-btn" onClick={onNext} title="Next Lead">
                <ChevronRight size={16} />
              </button>
            )}
            <button
              className={`lead-modal-btn${saved ? " saved" : ""}`}
              onClick={handleToggleSave}
            >
              <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
              <span>{saved ? "Saved" : "Save Lead"}</span>
            </button>
            {lead.email && (
              <button
                className={`lead-modal-btn primary${copiedEmail ? " copied" : ""}`}
                onClick={handleCopyEmail}
              >
                {copiedEmail ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedEmail ? "Copied" : "Copy Email"}</span>
              </button>
            )}
          </div>
        </div>

        <div className="lead-modal-body">
          <h2 className="lead-modal-name">{lead.full_name}</h2>
          <div className="lead-modal-role">
            {lead.headline || `${lead.job_title || "Lead"} ${lead.company_name ? `at ${lead.company_name}` : ""}`}
          </div>

          {/* Structured Intelligence Grid */}
          <div className="lead-modal-grid">
            <div className="lead-modal-field">
              <label>Company</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={14} color="var(--app-ink-faint)" />
                {lead.company_name || "—"}
              </div>
            </div>

            <div className="lead-modal-field">
              <label>Job Title</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Briefcase size={14} color="var(--app-ink-faint)" />
                {lead.job_title || "—"}
              </div>
            </div>

            <div className="lead-modal-field">
              <label>Industry</label>
              <div>{lead.industry || "—"}</div>
            </div>

            <div className="lead-modal-field">
              <label>Location</label>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={14} color="var(--app-ink-faint)" />
                {locationString(lead) || "Location unknown"}
              </div>
            </div>

            <div className="lead-modal-field">
              <label>Email Address</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={14} color="var(--app-ink-faint)" />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12.5px" }}>
                  {lead.email || "—"}
                </span>
              </div>
            </div>

            <div className="lead-modal-field">
              <label>Verification Status</label>
              <div>
                {lead.is_verified ? (
                  <span className="lead-pill lead-pill-verified">
                    <BadgeCheck size={13} /> Verified Contact
                  </span>
                ) : (
                  <span className="lead-pill lead-pill-company">Standard</span>
                )}
              </div>
            </div>
          </div>

          {/* About / Bio */}
          {lead.about && (
            <>
              <div className="lead-modal-section-title">Executive Summary</div>
              <p className="lead-modal-about">{lead.about}</p>
            </>
          )}

          {/* Social Links & Masking Notice */}
          <div className="lead-modal-contact-card">
            {lead.linkedin_url || lead.website_url ? (
              <ShieldCheck size={20} style={{ flex: "none" }} />
            ) : (
              <Lock size={20} style={{ flex: "none" }} />
            )}
            <div style={{ flex: 1 }}>
              {lead.linkedin_url || lead.website_url ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {lead.linkedin_url && (
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 700,
                        color: "var(--app-green)",
                        textDecoration: "underline",
                      }}
                    >
                      <Linkedin size={14} /> View LinkedIn Profile <ExternalLink size={12} />
                    </a>
                  )}
                  {lead.website_url && (
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 700,
                        color: "var(--app-green)",
                        textDecoration: "underline",
                      }}
                    >
                      <Globe size={14} /> Visit Website <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ) : (
                <div>
                  <strong>Privacy Protected:</strong> Direct contact phone and private socials are masked for free members. Verified accounts and team plans unlock direct enrichment.
                </div>
              )}
            </div>
          </div>

          {/* Bottom Quick Tools */}
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              className="lead-modal-btn"
              onClick={handleCopySummary}
            >
              {copiedSummary ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedSummary ? "Summary Copied!" : "Copy Full Lead Summary"}</span>
            </button>

            <button
              type="button"
              className="lead-modal-btn primary"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
