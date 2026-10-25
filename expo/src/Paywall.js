// src/Paywall.js
//
// "Unlimited stories" screen. Shown when the free monthly limit is reached,
// and from the About screen.
//
// Because DoodleStories is used by children, buying is behind a simple
// grown-up check (a multiplication question) so a child can't subscribe by
// tapping around. Plans and prices come live from RevenueCat / Google Play,
// so price changes in Play Console show up here automatically.

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "./constants";
import { buyPackage, getPackages, isPurchasesReady, restorePurchases } from "./purchases";

function makeQuestion() {
  const a = 3 + Math.floor(Math.random() * 7); // 3–9
  const b = 3 + Math.floor(Math.random() * 7);
  return { text: `${a} × ${b}`, answer: String(a * b) };
}

function planLabel(pkg) {
  const price = pkg?.product?.priceString || "";
  if (pkg?.packageType === "ANNUAL") return { title: "Yearly", detail: `${price} / year`, badge: "Best value" };
  if (pkg?.packageType === "MONTHLY") return { title: "Monthly", detail: `${price} / month` };
  return { title: pkg?.product?.title || "Plan", detail: price };
}

export default function Paywall({ visible, onClose, onPurchased, reason }) {
  const [stage, setStage] = useState("gate"); // gate → plans
  const [question, setQuestion] = useState(makeQuestion);
  const [answer, setAnswer] = useState("");
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  // Reset every time the paywall opens.
  useEffect(() => {
    if (!visible) return;
    setStage("gate");
    setQuestion(makeQuestion());
    setAnswer("");
    setMessage(null);
  }, [visible]);

  // Load plans once the grown-up check is passed.
  useEffect(() => {
    if (!visible || stage !== "plans") return;
    if (!isPurchasesReady()) {
      setMessage("Subscriptions aren't available in this version of the app yet.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPackages()
      .then((list) => {
        if (cancelled) return;
        // Show yearly first.
        const sorted = [...list].sort((a, b) => (a.packageType === "ANNUAL" ? -1 : b.packageType === "ANNUAL" ? 1 : 0));
        setPackages(sorted);
        if (sorted.length === 0) setMessage("Plans couldn't be loaded. Please try again later.");
      })
      .catch(() => !cancelled && setMessage("Plans couldn't be loaded. Please check your connection."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visible, stage]);

  const checkAnswer = () => {
    if (answer.trim() === question.answer) {
      setStage("plans");
      setMessage(null);
    } else {
      setMessage("Not quite — please ask a grown-up to help.");
      setQuestion(makeQuestion());
      setAnswer("");
    }
  };

  const buy = async (pkg) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await buyPackage(pkg);
      if (result === "purchased") {
        onPurchased?.();
      } else if (result === "pending") {
        setMessage("Your payment is processing. Unlimited stories will unlock as soon as it completes.");
      }
      // "cancelled": do nothing, the parent closed the Google Play sheet.
    } catch (err) {
      setMessage("The purchase didn't go through. No charge was made — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const active = await restorePurchases();
      if (active) onPurchased?.();
      else setMessage("We couldn't find an active subscription on this Google account.");
    } catch {
      setMessage("Restore didn't work just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Pressable onPress={onClose} style={s.close} hitSlop={12}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>

          <Text style={s.emoji}>🌟</Text>
          <Text style={s.title}>Unlimited Stories</Text>
          {reason ? <Text style={s.reason}>{reason}</Text> : null}

          {stage === "gate" ? (
            <View>
              <Text style={s.body}>Grown-ups only! To continue, please answer:</Text>
              <Text style={s.question}>What is {question.text}?</Text>
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                keyboardType="number-pad"
                placeholder="Answer"
                placeholderTextColor="#A8A29E"
                style={s.input}
                onSubmitEditing={checkAnswer}
                maxLength={3}
              />
              <Pressable onPress={checkAnswer} style={s.primary}>
                <Text style={s.primaryText}>Continue</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={s.body}>Make as many bedtime stories as your little artist likes, every month.</Text>
              {loading ? (
                <ActivityIndicator color={COLORS.accent1} style={{ marginVertical: 24 }} />
              ) : (
                packages.map((pkg) => {
                  const p = planLabel(pkg);
                  return (
                    <Pressable key={pkg.identifier} disabled={busy} onPress={() => buy(pkg)} style={[s.plan, busy && s.disabled]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.planTitle}>{p.title}</Text>
                        <Text style={s.planDetail}>{p.detail}</Text>
                      </View>
                      {p.badge ? <Text style={s.badge}>{p.badge}</Text> : null}
                    </Pressable>
                  );
                })
              )}
              {busy ? <ActivityIndicator color={COLORS.accent1} style={{ marginTop: 8 }} /> : null}
              <Pressable onPress={restore} disabled={busy} style={s.restore}>
                <Text style={s.restoreText}>Restore purchases</Text>
              </Pressable>
              <Text style={s.fine}>
                Billed through Google Play. Renews automatically until cancelled. Cancel anytime in Google Play →
                Subscriptions.
              </Text>
            </View>
          )}

          {message ? <Text style={s.message}>{message}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  card: { backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  close: { alignSelf: "flex-end" },
  closeText: { fontSize: 22, color: COLORS.muted },
  emoji: { fontSize: 44, textAlign: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", color: COLORS.text, marginBottom: 6 },
  reason: { textAlign: "center", color: COLORS.accent1, marginBottom: 8 },
  body: { textAlign: "center", color: COLORS.muted, marginBottom: 16, lineHeight: 21 },
  question: { fontSize: 22, fontWeight: "700", textAlign: "center", color: COLORS.text, marginBottom: 12 },
  input: {
    borderWidth: 2, borderColor: COLORS.border, borderRadius: 14, padding: 12, fontSize: 20,
    textAlign: "center", backgroundColor: "#fff", marginBottom: 12,
    color: "#2D2D2D",
  },
  primary: { backgroundColor: COLORS.accent1, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  plan: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderWidth: 2,
    borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 10,
  },
  planTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  planDetail: { fontSize: 15, color: COLORS.muted, marginTop: 2 },
  badge: {
    backgroundColor: COLORS.accent3, color: "#fff", fontWeight: "700", fontSize: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: "hidden",
  },
  disabled: { opacity: 0.5 },
  restore: { alignItems: "center", paddingVertical: 12 },
  restoreText: { color: COLORS.accent4, fontWeight: "600" },
  fine: { fontSize: 11, color: COLORS.muted, textAlign: "center", lineHeight: 16 },
  message: { marginTop: 12, textAlign: "center", color: COLORS.accent1 },
});
