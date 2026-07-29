import { useState, useEffect } from "react";

const MONTHLY_PRICE_ID = "price_1TfRHlPQ9TnCZr87tO1waQAy";
const ANNUAL_PRICE_ID = "price_1TfRHjPQ9TnCZr87yn9DvCCK";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

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

export default function PaywallModal({ isOpen, onClose, reason = "limit" }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState(null);

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleUpgrade = async (priceId, planKey) => {
    setError(null);
    setLoadingPlan(planKey);
    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
      setLoadingPlan(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "Georgia, serif",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card,
          borderRadius: 28,
          padding: "32px 28px 24px",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
          border: `2px solid ${COLORS.border}`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 8, lineHeight: 1 }}>🌟</div>

        <h2
          id="paywall-title"
          style={{
            margin: "0 0 10px",
            fontSize: "clamp(1.15rem, 4vw, 1.45rem)",
            color: COLORS.text,
            lineHeight: 1.25,
          }}
        >
          {reason === "upsell"
            ? "Unlock unlimited Doodle Stories!"
            : "You\u2019ve used all 10 free stories this month!"}
        </h2>
        <p
          style={{
            margin: "0 0 24px",
            color: COLORS.muted,
            fontSize: "0.92rem",
            lineHeight: 1.55,
          }}
        >
          {reason === "upsell"
            ? "Go Family Plan for unlimited stories every month \u2014 create as many magical bedtime stories as your family likes."
            : "Upgrade to the Family Plan for unlimited stories every month, so the magic never has to stop."}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          {/* Monthly */}
          <div
            style={{
              background: "linear-gradient(135deg, #FFF8E1, #FFFDF5)",
              border: `2px solid ${COLORS.accent2}`,
              borderRadius: 18,
              padding: "18px 14px",
              boxShadow: "0 4px 16px rgba(255, 217, 61, 0.2)",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "0.78rem",
                fontWeight: "bold",
                color: COLORS.accent4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Monthly
            </p>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: "1.35rem",
                fontWeight: "bold",
                color: COLORS.text,
              }}
            >
              $4.99
              <span style={{ fontSize: "0.82rem", fontWeight: "normal", color: COLORS.muted }}>
                /month
              </span>
            </p>
            <button
              type="button"
              disabled={!!loadingPlan}
              onClick={() => handleUpgrade(MONTHLY_PRICE_ID, "monthly")}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 14,
                border: "none",
                background: `linear-gradient(135deg, ${COLORS.accent4}, #7B61FF)`,
                color: "white",
                fontSize: "0.88rem",
                fontWeight: "bold",
                cursor: loadingPlan ? "wait" : "pointer",
                opacity: loadingPlan && loadingPlan !== "monthly" ? 0.6 : 1,
                fontFamily: "Georgia, serif",
                boxShadow: "0 6px 18px rgba(77, 150, 255, 0.35)",
              }}
            >
              {loadingPlan === "monthly" ? "Redirecting…" : "Choose Monthly"}
            </button>
          </div>

          {/* Annual */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(107,203,119,0.12), rgba(255,107,107,0.08))",
              border: `2px solid ${COLORS.accent3}`,
              borderRadius: 18,
              padding: "18px 14px",
              boxShadow: "0 4px 16px rgba(107, 203, 119, 0.25)",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -10,
                left: "50%",
                transform: "translateX(-50%)",
                background: COLORS.accent1,
                color: "white",
                fontSize: "0.65rem",
                fontWeight: "bold",
                padding: "3px 10px",
                borderRadius: 20,
                whiteSpace: "nowrap",
              }}
            >
              Best Value — Save 33%
            </span>
            <p
              style={{
                margin: "8px 0 4px",
                fontSize: "0.78rem",
                fontWeight: "bold",
                color: COLORS.accent3,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Annual
            </p>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: "1.35rem",
                fontWeight: "bold",
                color: COLORS.text,
              }}
            >
              $39.99
              <span style={{ fontSize: "0.82rem", fontWeight: "normal", color: COLORS.muted }}>
                /year
              </span>
            </p>
            <button
              type="button"
              disabled={!!loadingPlan}
              onClick={() => handleUpgrade(ANNUAL_PRICE_ID, "annual")}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 14,
                border: "none",
                background: `linear-gradient(135deg, ${COLORS.accent1}, #FF8E53)`,
                color: "white",
                fontSize: "0.88rem",
                fontWeight: "bold",
                cursor: loadingPlan ? "wait" : "pointer",
                opacity: loadingPlan && loadingPlan !== "annual" ? 0.6 : 1,
                fontFamily: "Georgia, serif",
                boxShadow: "0 6px 18px rgba(255, 107, 107, 0.35)",
              }}
            >
              {loadingPlan === "annual" ? "Redirecting…" : "Choose Annual"}
            </button>
          </div>
        </div>

        <p
          style={{
            margin: "0 0 14px",
            color: COLORS.muted,
            fontSize: "0.76rem",
            lineHeight: 1.5,
          }}
        >
          Cancel anytime. Your free 10 stories refresh every month either way.
        </p>

        {error && (
          <p
            style={{
              margin: "0 0 12px",
              color: COLORS.accent1,
              fontSize: "0.82rem",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: COLORS.muted,
            fontSize: "0.82rem",
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: "Georgia, serif",
            padding: "4px 8px",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
