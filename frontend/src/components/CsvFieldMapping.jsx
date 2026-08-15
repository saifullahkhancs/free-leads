import { useState, useEffect } from "react";
import { ArrowRight, ArrowLeft, X, Plus, Check, Loader2 } from "lucide-react";

// Standard lead database fields
const DB_FIELDS = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "headline", label: "Headline", required: false },
  { key: "about", label: "About", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "twitter_url", label: "Twitter URL", required: false },
  { key: "facebook_url", label: "Facebook URL", required: false },
  { key: "website_url", label: "Website URL", required: false },
  { key: "company_name", label: "Company Name", required: false },
  { key: "job_title", label: "Job Title", required: false },
  { key: "industry", label: "Industry", required: false },
  { key: "country", label: "Country", required: false },
  { key: "country_code", label: "Country Code", required: false },
  { key: "region", label: "Region/State", required: false },
  { key: "city", label: "City", required: false },
  { key: "lat", label: "Latitude", required: false },
  { key: "lon", label: "Longitude", required: false },
];

// Common field name variations for auto-matching
const FIELD_ALIASES = {
  full_name: ["full name", "name", "full_name", "contact name", "person name"],
  headline: ["headline", "title", "job headline", "professional title"],
  about: ["about", "bio", "biography", "description", "summary"],
  email: ["email", "email address", "mail", "e-mail"],
  phone: ["phone", "phone number", "telephone", "mobile", "cell"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile"],
  twitter_url: ["twitter", "twitter url", "twitter handle", "x"],
  facebook_url: ["facebook", "facebook url", "fb"],
  website_url: ["website", "web", "url", "site", "homepage"],
  company_name: ["company", "company name", "organization", "organization name", "employer"],
  job_title: ["job title", "title", "position", "role", "designation"],
  industry: ["industry", "sector", "business sector"],
  country: ["country", "country name", "nation"],
  country_code: ["country code", "iso code", "country iso"],
  region: ["region", "state", "province", "state/province"],
  city: ["city", "city name", "location", "town"],
  lat: ["lat", "latitude", "gps lat"],
  lon: ["lon", "longitude", "long", "gps lon"],
};

export default function CsvFieldMapping({ csvHeaders, sampleData, onConfirm, onCancel }) {
  const [mapping, setMapping] = useState({});
  const [combinedMappings, setCombinedMappings] = useState({});
  const [activeCombination, setActiveCombination] = useState(null);

  // Auto-match fields on mount
  useEffect(() => {
    const autoMapping = {};
    csvHeaders.forEach(csvHeader => {
      const normalized = csvHeader.toLowerCase().trim();
      
      for (const [dbField, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
          autoMapping[dbField] = {
            type: 'single',
            csvField: csvHeader
          };
          break;
        }
      }
    });
    setMapping(autoMapping);
  }, [csvHeaders]);

  const handleSingleMapping = (dbField, csvField) => {
    setMapping(prev => ({
      ...prev,
      [dbField]: {
        type: 'single',
        csvField
      }
    }));
  };

  const handleRemoveMapping = (dbField) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[dbField];
      return newMapping;
    });
  };

  const handleStartCombination = (dbField) => {
    setActiveCombination({
      dbField,
      csvFields: [],
      separator: 'space'
    });
  };

  const handleToggleCsvField = (csvField) => {
    if (!activeCombination) return;
    
    setActiveCombination(prev => {
      const csvFields = prev.csvFields.includes(csvField)
        ? prev.csvFields.filter(f => f !== csvField)
        : [...prev.csvFields, csvField];
      return { ...prev, csvFields };
    });
  };

  const handleSetSeparator = (separator) => {
    setActiveCombination(prev => ({ ...prev, separator }));
  };

  const handleSaveCombination = () => {
    if (!activeCombination || activeCombination.csvFields.length === 0) return;
    
    setCombinedMappings(prev => ({
      ...prev,
      [activeCombination.dbField]: {
        type: 'combined',
        csvFields: activeCombination.csvFields,
        separator: activeCombination.separator
      }
    }));
    
    // Remove single mapping if it exists
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[activeCombination.dbField];
      return newMapping;
    });
    
    setActiveCombination(null);
  };

  const handleCancelCombination = () => {
    setActiveCombination(null);
  };

  const handleRemoveCombined = (dbField) => {
    setCombinedMappings(prev => {
      const newMapping = { ...prev };
      delete newMapping[dbField];
      return newMapping;
    });
  };

  const handleConfirm = () => {
    const finalMapping = { ...mapping, ...combinedMappings };
    onConfirm(finalMapping);
  };

  const getMappedField = (dbField) => {
    if (mapping[dbField]) return mapping[dbField];
    if (combinedMappings[dbField]) return combinedMappings[dbField];
    return null;
  };

  const getCsvFieldsForDb = (dbField) => {
    const mapped = getMappedField(dbField);
    if (!mapped) return [];
    if (mapped.type === 'single') return [mapped.csvField];
    return mapped.csvFields;
  };

  const isCsvFieldMapped = (csvField) => {
    for (const mapConfig of Object.values({ ...mapping, ...combinedMappings })) {
      if (mapConfig.type === 'single' && mapConfig.csvField === csvField) return true;
      if (mapConfig.type === 'combined' && mapConfig.csvFields.includes(csvField)) return true;
    }
    return false;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg)',
        borderRadius: 12,
        width: '90%',
        maxWidth: 1200,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 24,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Map CSV Fields</h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)', fontSize: 14 }}>
              Connect your CSV columns to the database fields
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 8,
              color: 'var(--ink-muted)'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sample Data Preview */}
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--panel)', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>CSV Preview (First 5 rows)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {csvHeaders.map(header => (
                    <th key={header} style={{ padding: 8, textAlign: 'left', fontWeight: 600, color: 'var(--ink-muted)' }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleData.slice(0, 5).map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {csvHeaders.map(header => (
                      <td key={header} style={{ padding: 8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[header] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mapping Interface */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }}>
          {/* CSV Columns */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600 }}>CSV Columns</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {csvHeaders.map(csvHeader => (
                <div
                  key={csvHeader}
                  style={{
                    padding: 12,
                    background: isCsvFieldMapped(csvHeader) ? 'var(--panel-hover)' : 'var(--panel)',
                    borderRadius: 8,
                    border: isCsvFieldMapped(csvHeader) ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{csvHeader}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                    {sampleData[0]?.[csvHeader] || '(empty)'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Database Fields */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600 }}>Database Fields</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DB_FIELDS.map(dbField => {
                const mapped = getMappedField(dbField.key);
                return (
                  <div
                    key={dbField.key}
                    style={{
                      padding: 12,
                      background: mapped ? 'var(--panel-hover)' : 'var(--panel)',
                      borderRadius: 8,
                      border: mapped ? '2px solid var(--accent)' : '1px solid var(--border)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {dbField.label}
                          {dbField.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
                        </div>
                        {mapped && (
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                            {mapped.type === 'single' ? (
                              <span>← {mapped.csvField}</span>
                            ) : (
                              <span>← {mapped.csvFields.join(` ${mapped.separator === 'comma' ? ',' : ''} `)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {mapped ? (
                          <>
                            <button
                              onClick={() => {
                                if (mapped.type === 'single') handleRemoveMapping(dbField.key);
                                else handleRemoveCombined(dbField.key);
                              }}
                              style={{
                                background: 'var(--danger-soft)',
                                border: 'none',
                                padding: 6,
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: 'var(--danger)'
                              }}
                              title="Remove mapping"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartCombination(dbField.key)}
                              style={{
                                background: 'var(--blue-soft)',
                                border: 'none',
                                padding: 6,
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: 'var(--blue)'
                              }}
                              title="Combine multiple fields"
                            >
                              <Plus size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Single field mapping dropdown */}
                    {!mapped && (
                      <select
                        value=""
                        onChange={(e) => handleSingleMapping(dbField.key, e.target.value)}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          padding: 6,
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          fontSize: 12
                        }}
                      >
                        <option value="">Select CSV column...</option>
                        {csvHeaders.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Combination Modal */}
        {activeCombination && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
          }}>
            <div style={{
              background: 'var(--bg)',
              borderRadius: 12,
              width: 500,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
                Combine Fields for "{DB_FIELDS.find(f => f.key === activeCombination.dbField)?.label}"
              </h3>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Select CSV fields to combine:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {csvHeaders.map(header => (
                    <button
                      key={header}
                      onClick={() => handleToggleCsvField(header)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: activeCombination.csvFields.includes(header) ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: activeCombination.csvFields.includes(header) ? 'var(--panel-hover)' : 'var(--panel)',
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      {header}
                      {activeCombination.csvFields.includes(header) && <Check size={12} style={{ marginLeft: 4, display: 'inline' }} />}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Separator:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleSetSeparator('space')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: activeCombination.separator === 'space' ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: activeCombination.separator === 'space' ? 'var(--panel-hover)' : 'var(--panel)',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    Space ( )
                  </button>
                  <button
                    onClick={() => handleSetSeparator('comma')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: activeCombination.separator === 'comma' ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: activeCombination.separator === 'comma' ? 'var(--panel-hover)' : 'var(--panel)',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    Comma (,)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCancelCombination}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCombination}
                  disabled={activeCombination.csvFields.length === 0}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: activeCombination.csvFields.length > 0 ? 'var(--accent)' : 'var(--border)',
                    color: '#fff',
                    cursor: activeCombination.csvFields.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: 13
                  }}
                >
                  Save Combination
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500
            }}
          >
            Import with Mapping
          </button>
        </div>
      </div>
    </div>
  );
}
