import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Compass,
  LifeBuoy,
  Mail,
  MailCheck,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";

/**
 * Public "Contact Us" page. Anyone (logged in or not) can fill the form;
 * a message is stored in the DB and a notification is emailed to the
 * support team. Layout is consistent with the rest of the marketing site.
 */
export default function ContactPage() {
  const { isAuthenticated, user } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Prefill the form for signed-in users so they don't have to retype their
  // name/email every time.
  useEffect(() => {
    if (isAuthenticated && user) {
      setForm((prev) => ({
        ...prev,
        fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || prev.fullName,
        email: user.email || prev.email,
      }));
    }
  }, [isAuthenticated, user]);


  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.submitContactForm({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Couldn't send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewMessage = () => {
    setSubmitted(false);
    setForm({ fullName: form.fullName, email: form.email, subject: "", message: "" });
  };

  return (
    <div className="landing">

      <main>
        <section className="landing-hero contact-hero">
          <div className="hero-grid-bg" />
          <div className="landing-container contact-hero-grid">
            <div className="landing-hero-copy">
              <span className="hero-badge">
                <span className="pulse-dot" /> We usually reply within one business day
              </span>
              <h1>Get in <span className="accent">touch</span><br />with the team.</h1>
              <p className="hero-sub">
                Questions about plans, your account, the data, or a partnership idea?
                Drop us a message and a real human will get back to you.
              </p>
              <div className="contact-info-row">
                <div className="contact-info-card">
                  <span className="contact-info-icon"><Mail size={17} /></span>
                  <div>
                    <strong>Email</strong>
                    <small>support@freeleads.app</small>
                  </div>
                </div>
                <div className="contact-info-card">
                  <span className="contact-info-icon"><LifeBuoy size={17} /></span>
                  <div>
                    <strong>Support hours</strong>
                    <small>Mon–Fri, 9am–6pm (UTC)</small>
                  </div>
                </div>
                <div className="contact-info-card">
                  <span className="contact-info-icon"><MapPin size={17} /></span>
                  <div>
                    <strong>Remote-first</strong>
                    <small>Team across 4 timezones</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="contact-card-wrap">
              {submitted ? (
                <div className="contact-card contact-card-success">
                  <div className="contact-success-icon"><CheckCircle2 size={28} /></div>
                  <h3>Message received</h3>
                  <p>
                    Thanks {form.fullName.split(" ")[0] || "for reaching out"} — we've logged
                    your message and a member of the team will follow up at{" "}
                    <strong>{form.email}</strong>.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={handleNewMessage}>
                    <MessageSquare size={15} /> Send another message
                  </button>
                </div>
              ) : (
                <form className="contact-card" onSubmit={handleSubmit}>
                  <div className="contact-card-head">
                    <div>
                      <h3>Send us a message</h3>
                      <p>All fields are required. We never share your details.</p>
                    </div>
                    <span className="contact-card-icon"><Send size={18} /></span>
                  </div>

                  {error && <div className="contact-form-error">⚠ {error}</div>}

                  <div className="contact-form-row">
                    <label>
                      <span><User size={13} /> Full name</span>
                      <input
                        type="text"
                        name="fullName"
                        value={form.fullName}
                        onChange={handleChange}
                        placeholder="Jane Smith"
                        required
                        minLength={2}
                        maxLength={150}
                      />
                    </label>
                    <label>
                      <span><Mail size={13} /> Email</span>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="you@company.com"
                        required
                        maxLength={255}
                      />
                    </label>
                  </div>

                  <label className="contact-form-field">
                    <span><Sparkles size={13} /> Subject</span>
                    <input
                      type="text"
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      placeholder="How can we help?"
                      required
                      minLength={2}
                      maxLength={200}
                    />
                  </label>

                  <label className="contact-form-field">
                    <span><MessageSquare size={13} /> Message</span>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us a bit more about what you need…"
                      rows={6}
                      required
                      minLength={10}
                      maxLength={4000}
                    />
                    <small className="contact-form-counter">
                      {form.message.length}/4000 characters
                    </small>
                  </label>

                  <button type="submit" className="btn btn-primary btn-lg contact-submit" disabled={submitting}>
                    {submitting ? "Sending…" : "Send message"}
                    <Send size={15} />
                  </button>

                  <p className="contact-form-foot">
                    By submitting this form you agree to our{" "}
                    <Link to="/app/contact" className="contact-form-link">privacy policy</Link>.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="landing-section contact-why">
          <div className="landing-container">
            <div className="section-heading">
              <span className="section-kicker">WHY WRITE TO US</span>
              <h2>Help that actually <em>helps</em>.</h2>
              <p>The same people who built Free Leads will read your message — no ticket roulette.</p>
            </div>
            <div className="contact-why-grid">
              <div className="contact-why-card">
                <span className="contact-why-icon"><Compass size={18} /></span>
                <h3>Product guidance</h3>
                <p>Not sure which plan fits your use case? Tell us about your workflow and we'll recommend the right tier.</p>
              </div>
              <div className="contact-why-card">
                <span className="contact-why-icon"><MailCheck size={18} /></span>
                <h3>Account & billing</h3>
                <p>Update your details, fix a billing issue, or pause your subscription without digging through docs.</p>
              </div>
              <div className="contact-why-card">
                <span className="contact-why-icon"><Phone size={18} /></span>
                <h3>Partnerships</h3>
                <p>Bulk data partnerships, integrations or press inquiries — we love hearing about new collaborations.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

