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
    title: "1. Introduction",
    paragraphs: [
      "DoodleStories is operated by Luminara Labs LLC. We built this app so children and families can turn drawings into magical bedtime stories.",
      "We take privacy seriously — especially when children are involved. This policy explains what information we collect, how we use it, and the choices available to you and your family.",
    ],
  },
  {
    title: "2. Information We Collect",
    bullets: [
      "Images uploaded for story generation — sent to our servers only to create your story. We do not permanently store uploaded images after processing.",
      "Story content generated — saved locally in your browser (localStorage) so you can revisit stories in your Bedtime Story Library.",
      "Payment information — handled entirely by Stripe. We never see or store your full card details.",
      "Usage data via IP address — used only to track how many stories you have created each month for free-tier limits.",
    ],
  },
  {
    title: "3. Children's Privacy (COPPA)",
    paragraphs: [
      "DoodleStories is designed for use by children with parental supervision. We encourage parents and guardians to explore the app together with their kids.",
      "We do not knowingly collect personal information from children under 13 without appropriate parental consent.",
      "If you believe we have collected information from a child under 13, or if you would like to request deletion of any data associated with your family, please contact us and we will respond promptly.",
    ],
  },
  {
    title: "4. How We Use Information",
    bullets: [
      "To generate personalized stories using AI based on your doodle and chosen settings.",
      "To enforce free-tier story limits and provide unlimited access for premium subscribers.",
      "To process subscription payments through our payment provider.",
    ],
  },
  {
    title: "5. Data Sharing",
    intro: "We share limited data with trusted service providers who help us run DoodleStories. We do not sell your data.",
    bullets: [
      "Anthropic — AI story generation from uploaded images and prompts.",
      "OpenAI — text-to-speech narration for read-aloud stories.",
      "Stripe — secure payment processing for subscriptions.",
      "Upstash — anonymous usage tracking for monthly story counts.",
    ],
  },
  {
    title: "6. Contact Us",
    paragraphs: [
      "If you have questions about this Privacy Policy or how we handle your family's data, please reach out:",
    ],
    contact: "privacy@doodlestories.app",
  },
];

export default function PrivacyPolicyScreen({ onNavigate, isPremium, setShowPaywall }) {
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
          <div style={{ fontSize: 52, marginBottom: 10 }}>🔒</div>
          <h1
            style={{
              fontSize: "clamp(1.8rem, 5vw, 2.5rem)",
              color: COLORS.text,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Privacy <span style={{ color: COLORS.accent1 }}>Policy</span>
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
              {section.intro && (
                <p
                  style={{
                    color: COLORS.text,
                    lineHeight: 1.8,
                    fontSize: "0.92rem",
                    margin: "0 0 10px",
                  }}
                >
                  {section.intro}
                </p>
              )}
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
