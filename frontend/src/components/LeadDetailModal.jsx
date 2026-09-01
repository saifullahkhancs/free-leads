import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Bookmark,
  Briefcase,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { avatarColor, initialsOf, locationString } from "../utils/format";
import { isLeadSaved, saveLead, removeSavedLead } from "../utils/savedLeads";

export default function LeadDetailModal({
  lead,
  access = null,
  hasFullAccess = false,
  loading = false,
  error = null,
  onClose,
}) {
  const [saved, setSaved] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  useEffect(() => {
    if (lead) {
      setSaved(isLeadSaved(lead.id));
    }
  }, [lead]);

  // This modal is intentionally scoped to one person. Escape closes it; arrow
  // keys do not move to another result.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    // Add class to body to trigger CSS scroll prevention
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    // Find the scrollable container and disable its scroll
    const scrollableContainer = document.querySelector('.app-results-col') || 
                                document.querySelector('.app-search-layout') ||
                                document.querySelector('.site-main') ||
                                document.body;

    if (scrollableContainer) {
      scrollableContainer.style.overflow = 'hidden';
      scrollableContainer.style.overflowY = 'hidden';
      scrollableContainer.style.overflowX = 'hidden';
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      
      if (scrollableContainer) {
        scrollableContainer.style.overflow = '';
        scrollableContainer.style.overflowY = '';
        scrollableContainer.style.overflowX = '';
      }
    };
  }, [onClose]);

  if (!lead) return null;

  const canViewPrivateContact = Boolean(
    hasFullAccess ||
      access?.can_view_contact ||
      access?.show_phone ||
      access?.show_linkedin ||
      access?.show_twitter ||
      access?.show_website
  );
  const socialLinks = [
    { key: "linkedin", href: lead.linkedin_url, label: "LinkedIn", Icon: Linkedin },
    { key: "twitter", href: lead.twitter_url, label: "Twitter / X", Icon: ExternalLink },
    { key: "facebook", href: lead.facebook_url, label: "Facebook", Icon: ExternalLink },
    { key: "website", href: lead.website_url, label: "Website", Icon: Globe },
  ].filter((item) => item.href);
  const hasSocialLinks = socialLinks.length > 0;

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
    const summary = `${lead.full_name}\n${lead.job_title || ""} at ${lead.company_name || ""}\nIndustry: ${lead.industry || "N/A"}\nLocation: ${locationString(lead) || "N/A"}\nEmail: ${lead.email || "N/A"}\nPhone: ${lead.phone || "N/A"}\nLinkedIn: ${lead.linkedin_url || "N/A"}\nWebsite: ${lead.website_url || "N/A"}`;
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
          {loading && (
            <div className="lead-modal-load-state" role="status">
              Loading complete contact details…
            </div>
          )}
          {error && (
            <div className="lead-modal-load-state error" role="alert">
              {error} Showing the information already loaded in the list.
            </div>
          )}

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
              <label>Employees</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={14} color="var(--app-ink-faint)" />
                {lead.num_employees != null ? Number(lead.num_employees).toLocaleString() : "—"}
              </div>
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
              <label>Phone Number</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Phone size={14} color="var(--app-ink-faint)" />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12.5px" }}>
                  {lead.phone || (canViewPrivateContact ? "Not available" : "Protected")}
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

          {/* Social Links & access-aware availability notice */}
          <div className="lead-modal-contact-card">
            {hasSocialLinks || canViewPrivateContact ? (
              <ShieldCheck size={20} style={{ flex: "none" }} />
            ) : (
              <Lock size={20} style={{ flex: "none" }} />
            )}
            <div style={{ flex: 1 }}>
              {loading ? (
                <div>Checking private contact and social information…</div>
              ) : hasSocialLinks ? (
                <div className="lead-modal-social-links">
                  {socialLinks.map(({ key, href, label, Icon }) => (
                    <a key={key} href={href} target="_blank" rel="noreferrer">
                      <Icon size={14} /> View {label} <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              ) : canViewPrivateContact ? (
                <div>
                  <strong>Full access enabled:</strong> No private social profiles or website are stored for this lead.
                </div>
              ) : (
                <div>
                  <strong>Privacy Protected:</strong> Direct contact phone and private socials are masked for free members. Team plans unlock direct enrichment.
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
