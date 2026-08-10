const SAVED_KEY = "freeleads_saved_leads";

export function getSavedLeads() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLead(lead) {
  try {
    const current = getSavedLeads();
    if (current.some((l) => l.id === lead.id)) return current;
    const updated = [lead, ...current];
    localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeSavedLead(leadId) {
  try {
    const current = getSavedLeads();
    const updated = current.filter((l) => l.id !== leadId);
    localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function isLeadSaved(leadId) {
  const current = getSavedLeads();
  return current.some((l) => l.id === leadId);
}

export function exportLeadsToCsv(leads, filename = "leads_export.csv") {
  if (!leads || leads.length === 0) return;

  const headers = [
    "Full Name",
    "Job Title",
    "Headline",
    "Company",
    "Industry",
    "Location",
    "Email",
    "LinkedIn URL",
    "Website URL",
    "Verified",
    "Added Date",
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leads.map((l) => [
    escapeCsv(l.full_name),
    escapeCsv(l.job_title),
    escapeCsv(l.headline),
    escapeCsv(l.company_name),
    escapeCsv(l.industry),
    escapeCsv([l.city_name, l.region_name, l.country_name].filter(Boolean).join(", ")),
    escapeCsv(l.email),
    escapeCsv(l.linkedin_url),
    escapeCsv(l.website_url),
    escapeCsv(l.is_verified ? "Yes" : "No"),
    escapeCsv(l.created_at ? new Date(l.created_at).toLocaleDateString() : ""),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
