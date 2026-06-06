import { useMemo } from "react";

const COLORS = {
  bg: "#FFF9F0",
  card: "#FFFFFF",
  accent1: "#FF6B6B",
  accent2: "#FFD93D",
  accent3: "#6BCB77",
  accent4: "#4D96FF",
  text: "#2D2D2D",
  muted: "#8A8A8A",
  border: "#F0E6D3",
};

export default function SuccessScreen({ onNavigate }) {
  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 20%, #FFE8D6 0%, #FFF9F0 40%, #E8F4FF 100%)",
        fontFamily: "Georgia, serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes successFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes successPop {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "rgba(255, 217, 61, 0.18)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: -60,
          left: -60,
          width: 250,
          height: 250,
          borderRadius: "50%",
          background: "rgba(107, 203, 119, 0.14)",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 560,
          margin: "0 auto",
          padding: "72px 28px 80px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: COLORS.card,
            borderRadius: 28,
            padding: "48px 36px 40px",
            textAlign: "center",
            border: `2px solid ${COLORS.border}`,
            boxShadow: "0 16px 48px rgba(255, 107, 107, 0.12), 0 8px 24px rgba(255, 217, 61, 0.15)",
            animation: "successPop 0.5s ease-out",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 80,
              marginBottom: 20,
              lineHeight: 1,
              animation: "successFloat 2.5s infinite ease-in-out",
            }}
          >
            🎉
          </div>

          <h1
            style={{
              fontSize: "clamp(1.6rem, 5vw, 2.1rem)",
              color: COLORS.text,
              margin: "0 0 16px",
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
            }}
          >
            You&apos;re now a{" "}
            <span style={{ color: COLORS.accent1 }}>DoodleStories</span> Family Member!
          </h1>

          <p
            style={{
              color: COLORS.muted,
              fontSize: "1.02rem",
              lineHeight: 1.65,
              margin: "0 auto 32px",
              maxWidth: 400,
            }}
          >
            Unlimited stories, all voices, and more — all unlocked for your family.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 10,
              marginBottom: 32,
              flexWrap: "wrap",
            }}
          >
            {["✨", "📚", "🎨", "🌙"].map((emoji) => (
              <span
                key={emoji}
                style={{
                  fontSize: "1.5rem",
                  background: "linear-gradient(135deg, #FFF8E1, #F0FFF4)",
                  borderRadius: 14,
                  padding: "8px 12px",
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                {emoji}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("home")}
            style={{
              padding: "16px 36px",
              borderRadius: 20,
              border: "none",
              background: `linear-gradient(135deg, ${COLORS.accent1}, #FF8E53)`,
              color: "white",
              fontSize: "1.05rem",
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "Georgia, serif",
              boxShadow: "0 8px 28px rgba(255, 107, 107, 0.35)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Start Creating Stories
          </button>

          {sessionId && (
            <p
              style={{
                margin: "24px 0 0",
                fontSize: "0.72rem",
                color: COLORS.muted,
                opacity: 0.7,
              }}
              aria-hidden="true"
            >
              Welcome aboard! 🌟
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
