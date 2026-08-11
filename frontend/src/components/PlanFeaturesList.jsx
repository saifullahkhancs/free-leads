import { Check, X } from "lucide-react";

export default function PlanFeaturesList({ plan }) {
  const allowed = (plan.allowed_formats || []).map((f) => String(f).toUpperCase());

  // Canonical format ordering
  const formatOrder = ["CSV", "EXCEL", "PDF", "JSON"];
  const includedFormats = formatOrder.filter((f) => allowed.includes(f));
  const includedFormatsLabel = includedFormats.join(", ");

  const allPossibleExports = [
    { key: "CSV", label: "CSV export" },
    { key: "PDF", label: "PDF export" },
    { key: "JSON", label: "JSON export" },
  ];

  const excludedExports = allPossibleExports.filter((item) => !allowed.includes(item.key));

  // Determine social & contact visibility
  const showEmail = plan.show_email !== undefined ? Boolean(plan.show_email) : Boolean(plan.can_view_contact);
  const showPhone = plan.show_phone !== undefined ? Boolean(plan.show_phone) : Boolean(plan.can_view_contact);
  const showLinkedin =
    plan.show_linkedin !== undefined ? Boolean(plan.show_linkedin) : Boolean(plan.can_view_contact);
  const showTwitter =
    plan.show_twitter !== undefined ? Boolean(plan.show_twitter) : Boolean(plan.can_view_contact);
  const showWebsite =
    plan.show_website !== undefined ? Boolean(plan.show_website) : Boolean(plan.can_view_contact);

  const anyContact = showEmail || showPhone || showLinkedin || showTwitter || showWebsite;
  const allContact = showEmail && showPhone && showLinkedin && showTwitter && showWebsite;

  const contactList = [
    showEmail && "Email",
    showPhone && "Phone",
    showLinkedin && "LinkedIn",
    showTwitter && "Twitter",
    showWebsite && "Website",
  ]
    .filter(Boolean)
    .join(", ");

  const formatNumber = (num) => {
    if (num === -1 || num === "-1" || num === null || num === undefined) {
      return "Unlimited";
    }
    return Number(num).toLocaleString();
  };

  return (
    <ul className="billing-plan-features">
      <li>
        <Check size={14} />
        <span>
          <strong>{formatNumber(plan.daily_search_quota)}</strong> searches/day
        </span>
      </li>
      <li>
        <Check size={14} />
        <span>
          <strong>{formatNumber(plan.daily_export_quota)}</strong> exports/day
        </span>
      </li>
      <li>
        <Check size={14} />
        <span>
          Up to <strong>{formatNumber(plan.max_export_per_req)}</strong> records/export
        </span>
      </li>
      <li>
        <Check size={14} />
        <span>
          Formats: <strong>{includedFormatsLabel || "EXCEL"}</strong>
        </span>
      </li>
      {excludedExports.map((item) => (
        <li key={item.key} className="plan-feature-excluded">
          <X size={14} />
          <span>{item.label}</span>
        </li>
      ))}
      <li>
        {allContact ? (
          <>
            <Check size={14} />
            <span>Full contact info &amp; social URLs</span>
          </>
        ) : anyContact ? (
          <>
            <Check size={14} />
            <span>Contact info: {contactList}</span>
          </>
        ) : (
          <>
            <X size={14} />
            <span>Masked email &amp; social details</span>
          </>
        )}
      </li>
    </ul>
  );
}
