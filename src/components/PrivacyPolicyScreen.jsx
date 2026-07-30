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

const LAST_UPDATED = "July 21, 2026";

const SECTIONS = [
  {
    title: "1. Introduction",
    paragraphs: [
      "DoodleStories is operated by Luminara Labs LLC. We built this app so children and families can turn drawings into magical bedtime stories. This policy covers both the DoodleStories website at doodlestories.app and the DoodleStories mobile app.",
      "DoodleStories turns a child's drawing into a story. To do that, the drawing is sent to our servers and on to our AI partners, which create the story text and read it aloud. We do not permanently store uploaded images after processing.",
      "We do not ask for a name, an email address, or an account. We do not show ads. We do not track children across apps or websites. We do not publish or share drawings or stories with other users — stories are saved on your own device, and only if you choose to save them.",
    ],
  },
  {
    title: "2. Who DoodleStories Is For",
    paragraphs: [
      "DoodleStories is designed for children, used with parental supervision. Because our audience includes children under 13, we follow the U.S. Children's Online Privacy Protection Act (COPPA) and Google Play's Families policy requirements.",
      "We encourage parents and guardians to explore the app together with their kids.",
      "Our guiding principle is data minimization: we collect as little as possible, we keep it for as short a time as possible, we do not build profiles of users, and we never use children's drawings or stories for advertising.",
    ],
  },
  {
    title: "3. What We Collect — Website and App",
    intro: "The following applies whether you use DoodleStories in a browser or in the mobile app.",
    bullets: [
      "Drawings and photos — whether drawn in the app or uploaded, the image is sent to our servers for two purposes: an automated safety check confirming it is appropriate for a children's app, and story generation. The image is processed and discarded. We do not store it.",
      "Story settings — the age group and story language you select, used to shape the story's reading level and language. These are sent with the request and not stored.",
      "Story text — sent to our narration provider to generate the read-aloud audio. We do not store it.",
    ],
  },
  {
    title: "4. What We Collect — Website Only",
    bullets: [
      "Monthly story counts — so that the free tier is limited to ten stories a month, our website keeps a simple counter of how many stories have been made. The counter is stored under an irreversible cryptographic hash derived from your network (IP) address, not the address itself, and the hash changes every month. We cannot reverse it, we cannot use it to recognize anyone, and it is never used for advertising or tracking across other apps or websites. Each counter is deleted automatically after 35 days.",
      "Payment information — subscription payments are handled entirely by Stripe. We never see or store your full card details.",
      "Cookies — the DoodleStories website sets no cookies.",
      "Analytics — we use no website analytics. We do not measure or record how individual visitors move around the site.",
      "Offline storage — the website can be installed and used offline. To make that work, your browser stores a copy of the site's files on your device. These are program files, not information about you, and they are removed when you clear your browser data.",
    ],
  },
  {
    title: "5. What We Collect — Mobile App Only",
    bullets: [
      "Photo library access — if you choose to upload an existing drawing, Android asks permission to access photos. The app receives only the single image you select. We never browse, scan, or upload your photo library, and you can decline — the in-app drawing canvas works without it.",
      "Contact form — if you write to us through the app's Contact form, the name, email address, reason, and message you enter are delivered to our inbox through a form-delivery service (FormSubmit). This form is intended for parents and other adults. We use what you send solely to reply, and never add it to a marketing list.",
    ],
  },
  {
    title: "6. Information Google Provides to Us",
    paragraphs: [
      "Like every developer, we can see aggregate, anonymous statistics that Google provides through the Play Console — for example, how many people installed the app, and in which countries. This is collected by Google as the app store operator under its own privacy policy, and is provided to us in summary form only. It never identifies you or your child.",
    ],
  },
  {
    title: "7. What Stays on Your Device",
    intro: "The following is stored only on your own device and is never transmitted to us:",
    bullets: [
      "Saved stories, including story text, the accompanying drawing, and the age group used.",
      "Reactions marked on saved stories.",
      "App preferences, such as your selected story language.",
    ],
  },
  {
    title: "8. How Long We Keep Information",
    intro: "We keep as little as possible, for as short a time as possible.",
    bullets: [
      "Drawings and uploaded photos — not stored. Processed to create your story, then discarded.",
      "Story text — not stored.",
      "Stories you save — kept on your device only, for as long as you choose. Deleted when you delete the story, clear your browser data, or uninstall the app.",
      "Monthly story counter (website) — deleted automatically 35 days after it is created.",
      "Messages sent through the Contact form — kept in our email inbox for 12 months, then deleted.",
      "Server request logs — automatically deleted after 1 day by our hosting provider.",
    ],
  },
  {
    title: "9. Service Providers",
    intro: "We share limited data with trusted providers who help us run DoodleStories. We do not sell your data, and we do not share it with advertisers or data brokers.",
    bullets: [
      "Anthropic — AI story generation and the image safety check, from uploaded drawings and prompts.",
      "OpenAI — text-to-speech narration for read-aloud stories.",
      "Upstash — stores the hashed monthly story counter for the website's free tier.",
      "Stripe — secure payment processing for website subscriptions.",
      "FormSubmit — delivery of messages sent through the app's Contact form.",
      "Vercel — hosts the DoodleStories website and the servers that pass content between the app and the services above.",
    ],
  },
  {
    title: "10. What We Do Not Do",
    bullets: [
      "We do not require or offer account creation.",
      "We do not collect names, email addresses, birthdays, or contact details from children.",
      "We do not collect precise location.",
      "We do not display advertising of any kind.",
      "We do not use advertising identifiers, and we do not permit any third party to use content from DoodleStories for ad targeting.",
      "We do not use analytics or crash-reporting tools that build profiles of individual users.",
      "We do not publish children's drawings or stories publicly, and we host no shared or community gallery.",
    ],
  },
  {
    title: "11. Sharing a Story Yourself",
    paragraphs: [
      "DoodleStories includes a Share button that lets you send a story to another app you choose — messages, email, social media, and so on. This happens entirely on your device. We receive no copy and have no visibility into where it goes.",
    ],
  },
  {
    title: "12. Parental Rights and Deletion",
    paragraphs: [
      "Parents and guardians may contact us to ask what information we hold, request deletion, or ask us to stop processing. We aim to respond within 5 business days.",
      "Because DoodleStories uses no accounts, does not store drawings or stories, and does not attach identifiers to submitted content, we generally hold no information tied to an individual child.",
      "You can delete everything DoodleStories has saved at any time, without contacting us: delete individual stories in the app, clear your browser data on the website, or uninstall the app to remove all locally stored content.",
      "If you believe we have collected personal information from a child under 13, please contact us and we will delete it.",
    ],
  },
  {
    title: "13. Security",
    paragraphs: [
      "Content sent between the app or website and our servers is encrypted in transit using HTTPS. Access to our systems is limited to authorized personnel. No system can be guaranteed completely secure, but we deliberately design DoodleStories so there is very little to protect: no accounts, no contact details collected from children, no stored drawings or stories, and no raw network addresses on record.",
    ],
  },
  {
    title: "14. Where Information Is Processed",
    paragraphs: [
      "DoodleStories is operated from the United States. Content is processed on servers in the United States and in other countries where our service providers operate. If you use DoodleStories from outside the United States, your content will be processed in the United States.",
    ],
  },
  {
    title: "15. Changes to This Policy",
    paragraphs: [
      "If we change how DoodleStories handles information, we will update this policy and revise the date shown above. Material changes will be reflected before they take effect.",
    ],
  },
  {
    title: "16. Contact Us",
    paragraphs: [
      "If you have questions about this Privacy Policy or how we handle your family's data, please reach out to Luminara Labs LLC:",
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
            Last updated: {LAST_UPDATED}
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
