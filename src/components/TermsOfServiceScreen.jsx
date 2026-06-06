const COLORS = {
  bg: "#FFF9F0",
  card: "#FFFFFF",
  accent1: "#FF6B6B",
  accent2: "#FFD93D",
  text: "#2D2D2D",
  muted: "#8A8A8A",
  border: "#F0E6D3",
};

function GoPremiumButton({ isPremium, setShowPaywall }) {
  if (isPremium) return null;
  return (
    <button
      type="button"
      onClick={() => setShowPaywall(true)}
      style={{
        padding: "6px 11px",
        borderRadius: 12,
        border: "1.5px solid #E6C200",
        background: "linear-gradient(135deg,#FFF8E1,#FFEFAA)",
        color: "#9A7200",
        fontSize: "0.72rem",
        fontWeight: "bold",
        cursor: "pointer",
        fontFamily: "Georgia,serif",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(255,217,61,0.22)",
      }}
    >
      ⭐ Go Premium
    </button>
  );
}

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    paragraphs: [
      "By accessing or using DoodleStories, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.",
      "DoodleStories is provided by Luminara Labs LLC (\"we,\" \"us,\" or \"our\").",
    ],
  },
  {
    title: "2. Description of Service",
    bullets: [
      "DoodleStories is an AI-powered children's storytelling web application that turns drawings into personalized bedtime stories.",
      "Free tier — up to 10 stories per month at no charge.",
      "Family Plan — unlimited stories via a paid subscription.",
    ],
  },
  {
    title: "3. User Responsibilities",
    bullets: [
      "You must be 18 years of age or older to purchase a subscription. Subscriptions must be purchased by a parent or legal guardian.",
      "Only upload content that is appropriate for children and suitable for a family-friendly storytelling app.",
      "Do not upload images containing real people's faces, private information, or any content that could identify or harm a child.",
    ],
  },
  {
    title: "4. Payments and Subscriptions",
    bullets: [
      "Family Plan subscriptions are billed at $4.99 per month or $39.99 per year.",
      "All payments are processed securely by Stripe. We do not store your full payment card details.",
      "You may cancel your subscription at any time. Access continues until the end of your current billing period.",
      "We do not offer refunds for partial billing periods.",
    ],
  },
  {
    title: "5. Intellectual Property",
    paragraphs: [
      "Stories generated through DoodleStories based on your uploads and inputs are owned by you, subject to these Terms and the rights of any third-party services used to create them.",
      "The DoodleStories name, logo, branding, and app design are owned by Luminara Labs LLC. You may not copy, modify, or distribute our intellectual property without written permission.",
    ],
  },
  {
    title: "6. Limitation of Liability",
    paragraphs: [
      "DoodleStories is provided on an \"as-is\" and \"as-available\" basis without warranties of any kind, express or implied.",
      "To the fullest extent permitted by law, Luminara Labs LLC shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.",
    ],
  },
  {
    title: "7. Changes to Terms",
    paragraphs: [
      "We may update these Terms of Service from time to time. When we do, we will post the revised terms in the app and update the \"Last updated\" date. Continued use of DoodleStories after changes take effect constitutes acceptance of the updated terms.",
    ],
  },
  {
    title: "8. Contact",
    paragraphs: [
      "If you have questions about these Terms of Service, please contact us at:",
    ],
    contact: "legal@doodlestories.app",
  },
];

export default function TermsOfServiceScreen({ onNavigate, isPremium, setShowPaywall }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 20%, #FFE8D6 0%, #FFF9F0 40%, #E8F4FF 100%)",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "30px 24px 60px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <button
            type="button"
            onClick={() => onNavigate("home")}
            style={{
              background: "none",
              border: `2px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: "7px 13px",
              cursor: "pointer",
              color: COLORS.text,
              fontSize: "0.86rem",
              fontFamily: "Georgia, serif",
            }}
          >
            ← Home
          </button>
          <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>📜</div>
          <h1
            style={{
              fontSize: "clamp(1.8rem, 5vw, 2.5rem)",
              color: COLORS.text,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Terms of <span style={{ color: COLORS.accent1 }}>Service</span>
          </h1>
          <p style={{ color: COLORS.muted, fontSize: "0.88rem", margin: 0 }}>
            Last updated: June 6, 2025
          </p>
        </div>

        <div
          style={{
            background: COLORS.card,
            borderRadius: 20,
            padding: "28px 28px 8px",
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
          }}
        >
          {SECTIONS.map((section) => (
            <section key={section.title} style={{ marginBottom: 28 }}>
              <h2
                style={{
                  color: COLORS.text,
                  fontSize: "1.05rem",
                  margin: "0 0 12px",
                }}
              >
                {section.title}
              </h2>
              {section.paragraphs?.map((text) => (
                <p
                  key={text.slice(0, 40)}
                  style={{
                    color: COLORS.text,
                    lineHeight: 1.8,
                    fontSize: "0.92rem",
                    margin: "0 0 12px",
                  }}
                >
                  {text}
                </p>
              ))}
              {section.bullets && (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 22,
                    color: COLORS.text,
                    lineHeight: 1.75,
                    fontSize: "0.92rem",
                  }}
                >
                  {section.bullets.map((item) => (
                    <li key={item.slice(0, 40)} style={{ marginBottom: 8 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.contact && (
                <p style={{ margin: "8px 0 0", fontSize: "0.92rem" }}>
                  <a
                    href={`mailto:${section.contact}`}
                    style={{ color: COLORS.accent1, fontWeight: "bold" }}
                  >
                    {section.contact}
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
