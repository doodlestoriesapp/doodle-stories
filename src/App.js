import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AGE_GROUPS, COLORS, LANGUAGES, VOICE_LINES } from "./src/constants";
import { apiPost } from "./src/api";
import { loadLibrary, loadVotes, saveLibrary, saveVotes } from "./src/storage";
import { useSpeech, prefetchStoryTTS } from "./src/useSpeech";
import DoodleCanvas from "./src/DoodleCanvas";

const PRIVACY_URL = "https://doodlestories.app/privacy";

function Btn({ label, onPress, primary, night, disabled, style }) {
  const inner = (
    <Text style={[styles.btnText, primary && styles.btnTextPrimary, night && styles.btnTextNight]}>
      {label}
    </Text>
  );
  if (primary) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[styles.btnWrap, style, disabled && styles.disabled]}>
        <LinearGradient colors={[COLORS.accent1, "#FF8E53"]} style={styles.btnGrad}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  if (night) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[styles.btnWrap, style, disabled && styles.disabled]}>
        <LinearGradient colors={[COLORS.night2, COLORS.night3]} style={styles.btnGrad}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnOutline, style, disabled && styles.disabled]}
    >
      {inner}
    </Pressable>
  );
}

function Screen({ children, night }) {
  return (
    <SafeAreaView style={[styles.screen, night && styles.screenNight]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ onNavigate, favorites }) {
  return (
    <Screen>
      <Text style={styles.heroEmoji}>🎨</Text>
      <Text style={styles.heroTitle}>
        Doodle <Text style={{ color: COLORS.accent1 }}>Stories</Text>
      </Text>
      <Text style={styles.heroSub}>
        Draw it. Upload it. Turn it into a magical story.{"\n"}Save it and listen again at bedtime. 🌙
      </Text>
      <Btn label="🖼️ Create a Story from My Doodle" primary onPress={() => onNavigate("create")} style={styles.mb12} />
      <Btn label="🌙 My Bedtime Stories" night onPress={() => onNavigate("library")} style={styles.mb24} />

      {favorites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❤️ Your Favorite Stories</Text>
          {favorites.slice(0, 3).map((s) => (
            <Pressable key={s.id} style={styles.heroCard} onPress={() => onNavigate("library")}>
              {s.doodleUrl ? <Image source={{ uri: s.doodleUrl }} style={styles.heroImg} /> : null}
              <Text style={styles.cardMeta}>{s.ageEmoji} {s.ageLabel}</Text>
              <Text style={styles.cardTitle}>{s.title}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.footerLinks}>
        <Pressable onPress={() => onNavigate("about")}>
          <Text style={styles.link}>About Us</Text>
        </Pressable>
        <Pressable onPress={() => onNavigate("contact")}>
          <Text style={styles.link}>Contact Us</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.link}>Privacy</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function ReadingModal({ story, onClose, nightMode, isFavorite, onToggleFavorite }) {
  const { speak, speakLong, stop, speaking } = useSpeech();
  const [readingLoading, setReadingLoading] = useState(false);

  const handleRead = async () => {
    if (speaking) {
      await stop();
      return;
    }
    setReadingLoading(true);
    await speak(VOICE_LINES.readAloud);
    await speakLong(`${story.title}. ${story.text}`);
    setReadingLoading(false);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, nightMode && styles.modalCardNight]}>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </Pressable>
          <Text style={styles.modalMeta}>{story.ageEmoji} {story.ageLabel} · Bedtime Story</Text>
          <Text style={[styles.modalTitle, nightMode && styles.textNight]}>{story.title}</Text>
          {story.doodleUrl ? (
            <Image source={{ uri: story.doodleUrl }} style={styles.modalImg} resizeMode="cover" />
          ) : null}
          <Btn
            label={speaking ? "⏹ Stop Reading" : readingLoading ? "✨ Warming up..." : "🔊 Read This Story Aloud"}
            primary
            onPress={handleRead}
            style={styles.mb12}
          />
          <ScrollView style={{ maxHeight: 280 }}>
            {story.text.split("\n\n").map((para, i) => (
              <Text key={i} style={[styles.storyPara, nightMode && styles.textNight]}>
                {para}
              </Text>
            ))}
          </ScrollView>
          <View style={styles.reactionRow}>
            <Pressable
              onPress={() => onToggleFavorite(story.id)}
              style={[styles.favBtn, isFavorite && styles.favBtnOn]}
            >
              <Text style={styles.favText}>
                {isFavorite ? "❤️ A favorite!" : "🤍 Add to favorites"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LibraryScreen({ onNavigate, library, favorites, onToggleFavorite, speak }) {
  const [readingStory, setReadingStory] = useState(null);
  const [nightMode, setNightMode] = useState(false);
  const spoken = useRef(false);

  useEffect(() => {
    if (!spoken.current) {
      spoken.current = true;
      setTimeout(() => speak(VOICE_LINES.library), 500);
    }
  }, [speak]);

  return (
    <Screen night={nightMode}>
      <View style={styles.rowBetween}>
        <Btn label="← Home" onPress={() => onNavigate("home")} />
        <Pressable onPress={() => setNightMode((n) => !n)}>
          <Text style={styles.nightToggle}>{nightMode ? "☀️ Day" : "🌙 Night"}</Text>
        </Pressable>
      </View>
      <Text style={[styles.heroTitle, nightMode && styles.textNight]}>My Bedtime Stories</Text>
      <Text style={styles.heroSub}>Your saved stories, ready to hear again</Text>

      {library.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyText}>No saved stories yet!</Text>
          <Btn label="🎨 Create Your First Story!" primary onPress={() => onNavigate("create")} />
        </View>
      ) : (
        library.map((s) => (
          <Pressable key={s.id} style={styles.storyCard} onPress={() => setReadingStory(s)}>
            {s.doodleUrl ? <Image source={{ uri: s.doodleUrl }} style={styles.cardImg} /> : null}
            <Text style={styles.cardMeta}>{s.ageEmoji} {s.ageLabel}</Text>
            <Text style={styles.cardTitle}>{s.title}{favorites[s.id] ? "  ❤️" : ""}</Text>
            <Text style={styles.cardPreview} numberOfLines={2}>{s.preview}</Text>
          </Pressable>
        ))
      )}

      <Btn label="🎨 Make Another Story" primary onPress={() => onNavigate("create")} style={styles.mt16} />

      {readingStory && (
        <ReadingModal
          story={readingStory}
          onClose={() => setReadingStory(null)}
          nightMode={nightMode}
          isFavorite={!!favorites[readingStory.id]}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </Screen>
  );
}

function CreateScreen({ onNavigate, onStoryAdded, currentLibrary }) {
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [imageMediaType, setImageMediaType] = useState("image/jpeg");
  const [ageGroup, setAgeGroup] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [showLangModal, setShowLangModal] = useState(false);
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { speak, speakLong, stop, speaking } = useSpeech();
  const spokenKeys = useRef(new Set());

  useEffect(() => {
    const key = step === 3 && loading ? "loading" : step === 3 && story ? "story" : String(step);
    if (spokenKeys.current.has(key)) return;
    spokenKeys.current.add(key);
    const line = VOICE_LINES[key];
    if (line) setTimeout(() => speak(line), 500);
  }, [step, loading, story, speak]);

  // Shared path for both uploaded and drawn images
  const acceptImage = async (base64, mediaType, uri) => {
    try {
      const mod = await apiPost("/api/moderate-image", { imageBase64: base64, mediaType });
      if (!mod.safe) {
        setError("⚠️ This image isn't suitable for our kids' app. Please try a different drawing!");
        return;
      }
    } catch (err) {
      console.warn("Moderation failed open:", err?.message);
    }
    setError(null);
    setImageUri(uri);
    setImageBase64(base64);
    setImageMediaType(mediaType);
    spokenKeys.current.delete("2");
    setStep(2);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Please allow photo access to upload a drawing.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const base64 = asset.base64;
    const mediaType = asset.mimeType || "image/jpeg";
    if (!base64) {
      setError("Could not read image. Try another photo.");
      return;
    }
    await acceptImage(base64, mediaType, asset.uri);
  };

  const handleDoodleDone = async (base64, mediaType) => {
    setDrawing(false);
    await acceptImage(base64, mediaType, `data:${mediaType};base64,${base64}`);
  };

  const generateStory = async () => {
    if (!imageBase64 || !ageGroup) return;
    setLoading(true);
    setError(null);
    spokenKeys.current.delete("loading");
    setStep(3);
    try {
      const data = await apiPost("/api/generate-story", {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        language: selectedLanguage,
        system:
          `You are a magical children's storyteller. Create a delightful story from a child's drawing. Respond in EXACTLY this format and nothing else. Do NOT use JSON. Do NOT put quotes around the values.
TITLE: put the story title here on one line
STORY:
put the full story here, as many paragraphs as you like
TAGS: put three to five comma-separated tags here`,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
              {
                type: "text",
                text: `Create a story for a ${ageGroup.range} year old. Style: ${ageGroup.prompt}. Make THEIR drawing the hero.`,
              },
            ],
          },
        ],
      });
      const raw = data.content?.find((b) => b.type === "text")?.text || "";
      console.log("STORY RAW:", raw.slice(0, 300));

      // Parse the plain-text TITLE / STORY / TAGS format
      const titleMatch = raw.match(/TITLE:\s*(.+)/i);
      const storyMatch = raw.match(/STORY:\s*([\s\S]*?)(?:\nTAGS:|$)/i);
      const tagsMatch = raw.match(/TAGS:\s*(.+)/i);

      const title = titleMatch ? titleMatch[1].trim() : "My Doodle Story";
      const story = storyMatch ? storyMatch[1].trim() : raw.trim();
      const tags = tagsMatch
        ? tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const parsed = { title, story, tags };
      spokenKeys.current.delete("story");
      setStory(parsed);
      prefetchStoryTTS(`${parsed.title}. ${parsed.story}`);
    } catch (err) {
      setError(err?.message || "Oops! The story magic fizzled. Try again!");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (confirmed) => {
    setShowSaveModal(false);
    if (!confirmed || !story) return;
    const doodleUrl = imageUri || (imageBase64 ? `data:${imageMediaType};base64,${imageBase64}` : null);
    const newEntry = {
      id: Date.now(),
      title: story.title,
      text: story.story,
      preview: story.story.split("\n\n")[0].slice(0, 120) + "...",
      tags: story.tags || [],
      ageLabel: ageGroup.label,
      ageEmoji: ageGroup.emoji,
      ageRange: ageGroup.range,
      doodleUrl,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    const updated = [newEntry, ...currentLibrary];
    await saveLibrary(updated);
    onStoryAdded(updated);
  };

  const shareStory = async () => {
    if (!story) return;
    await Share.share({
      message: `${story.title}\n\n${story.story.slice(0, 500)}...\n\nMade with DoodleStories — doodlestories.app`,
    });
  };

  const reset = () => {
    stop();
    setImageUri(null);
    setImageBase64(null);
    setAgeGroup(null);
    setStory(null);
    setError(null);
    setStep(1);
    setDrawing(false);
    spokenKeys.current.clear();
  };

  if (drawing) {
    return <DoodleCanvas onDone={handleDoodleDone} onCancel={() => setDrawing(false)} />;
  }

  return (
    <Screen>
      <View style={styles.rowBetween}>
        <Btn label="← Home" onPress={() => onNavigate("home")} />
        <Btn label="🌙 My Stories" night onPress={() => onNavigate("library")} />
      </View>
      <Text style={styles.heroTitle}>Doodle Stories</Text>

      {step === 1 && (
        <View>
          <Text style={styles.stepHint}>Draw your own or upload a photo ✨</Text>
          <Btn label="🎨 Draw My Doodle" primary onPress={() => { stop(); setDrawing(true); }} style={styles.mb12} />
          <Btn label="📸 Upload Drawing" onPress={() => { stop(); pickImage(); }} />
        </View>
      )}

      {step === 2 && (
        <View>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImg} resizeMode="contain" /> : null}
          <Text style={styles.stepHint}>How old is the little artist?</Text>
          <View style={styles.ageGrid}>
            {AGE_GROUPS.map((g) => (
              <Pressable
                key={g.range}
                onPress={() => {
                  setAgeGroup(g);
                  setTimeout(() => speak(VOICE_LINES.ageSelected), 300);
                }}
                style={[styles.ageBtn, ageGroup?.range === g.range && styles.ageBtnOn]}
              >
                <Text style={styles.ageEmoji}>{g.emoji}</Text>
                <Text style={styles.ageLabel}>{g.label}</Text>
                <Text style={styles.ageRange}>Ages {g.range}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Btn label="← New Doodle" onPress={reset} style={styles.mb8} />
          <Pressable onPress={() => setShowLangModal(true)} style={styles.langBtn}>
            <Text style={styles.langBtnText}>🌍 Story Language: {selectedLanguage}</Text>
          </Pressable>
          <Btn label="✨ Make My Story!" primary disabled={!ageGroup} onPress={generateStory} />
        </View>
      )}

      {step === 3 && loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent1} />
          <Text style={styles.stepHint}>The story magic is happening...</Text>
        </View>
      )}

      {step === 3 && !loading && story && (
        <View>
          <Text style={styles.storyHeading}>{story.title}</Text>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} /> : null}
          {story.story.split("\n\n").map((p, i) => (
            <Text key={i} style={styles.storyPara}>{p}</Text>
          ))}
          <Btn
            label={speaking ? "⏹ Stop Reading" : "🔊 Read This Story Aloud"}
            primary
            onPress={async () => {
              if (speaking) {
                await stop();
                return;
              }
              await speak(VOICE_LINES.readAloud);
              await speakLong(`${story.title}. ${story.story}`);
            }}
            style={styles.mb8}
          />
          <Btn label="📲 Share This Story" onPress={shareStory} style={styles.mb8} />
          <Btn label="🌙 Save This Story" night onPress={() => setShowSaveModal(true)} style={styles.mb8} />
          <Btn label="🎨 New Doodle" onPress={reset} />
        </View>
      )}

      {step === 3 && !loading && error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={showSaveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save this story?</Text>
            <Text style={styles.modalBody}>
              Save "{story?.title}" so you can listen to it again anytime?
            </Text>
            <Btn label="✨ Yes, save it!" primary onPress={() => handleSave(true)} style={styles.mb8} />
            <Btn label="Not now" onPress={() => handleSave(false)} />
          </View>
        </View>
      </Modal>
      <Modal visible={showLangModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowLangModal(false)}>
          <View style={styles.langModalCard}>
            <Text style={styles.modalTitle}>Choose Story Language</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {LANGUAGES.map((lang) => (
                <Pressable
                  key={lang}
                  onPress={() => {
                    setSelectedLanguage(lang);
                    setShowLangModal(false);
                  }}
                  style={[styles.langRow, selectedLanguage === lang && styles.langRowOn]}
                >
                  <Text style={styles.langRowText}>{lang}</Text>
                  {selectedLanguage === lang ? <Text>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function AboutScreen({ onNavigate }) {
  const links = [
    { label: "TikTok", url: "https://tiktok.com/@doodlestoriesapp" },
    { label: "Instagram", url: "https://instagram.com/doodlestoriesapp" },
    { label: "YouTube", url: "https://youtube.com/@DoodleStoriesapp" },
    { label: "Facebook", url: "https://facebook.com/doodlestoriesapp" },
  ];
  return (
    <Screen>
      <Btn label="← Home" onPress={() => onNavigate("home")} style={styles.mb16} />
      <Text style={styles.heroEmoji}>🎨</Text>
      <Text style={styles.heroTitle}>About Doodle Stories</Text>
      <Text style={styles.aboutPara}>
        Doodle Stories turns children's drawings into personalized AI bedtime stories — narrated and saved on your device.
      </Text>
      {links.map((l) => (
        <Pressable key={l.label} onPress={() => Linking.openURL(l.url)} style={styles.socialBtn}>
          <Text style={styles.socialText}>{l.label}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.socialBtn}>
        <Text style={styles.socialText}>Privacy Policy</Text>
      </Pressable>
      <Btn label="🎨 Create Your Story" primary onPress={() => onNavigate("create")} style={styles.mt16} />
    </Screen>
  );
}

function ContactScreen({ onNavigate }) {
  const [form, setForm] = useState({ name: "", email: "", reason: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!form.name || !form.email || !form.reason || !form.message) {
      setError("Please fill in all fields.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await fetch("https://formsubmit.co/ajax/doodlestoriesapp@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...form,
          _subject: `DoodleStories Contact: ${form.reason}`,
        }),
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Email doodlestoriesapp@gmail.com");
    }
    setSending(false);
  };

  return (
    <Screen>
      <Btn label="← Home" onPress={() => onNavigate("home")} style={styles.mb16} />
      <Text style={styles.heroTitle}>Get in Touch</Text>
      {submitted ? (
        <View style={styles.centered}>
          <Text style={styles.heroEmoji}>🎉</Text>
          <Text style={styles.stepHint}>Message sent! We'll reply within 1–2 business days.</Text>
          <Btn label="Back to Home" primary onPress={() => onNavigate("home")} />
        </View>
      ) : (
        <View>
          {["name", "email", "reason", "message"].map((field) => (
            <TextInput
              key={field}
              placeholder={field === "name" ? "Your name" : field === "email" ? "Email" : field === "reason" ? "Reason" : "Message"}
              value={form[field]}
              onChangeText={(t) => setForm((f) => ({ ...f, [field]: t }))}
              style={styles.input}
              multiline={field === "message"}
              keyboardType={field === "email" ? "email-address" : "default"}
            />
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Btn label={sending ? "Sending..." : "✉️ Send Message"} primary disabled={sending} onPress={submit} />
        </View>
      )}
    </Screen>
  );
}

function AppRoot() {
  const [view, setView] = useState("home");
  const [library, setLibrary] = useState([]);
  const [favorites, setFavorites] = useState({});
  const { speak } = useSpeech();

  useEffect(() => {
    Promise.all([loadLibrary(), loadVotes()]).then(([lib, v]) => {
      setLibrary(lib);
      setFavorites(v || {});
    });
  }, []);

  // Tapping the heart toggles a story in or out of favorites.
  const toggleFavorite = async (id) => {
    const next = { ...favorites };
    if (next[id]) delete next[id];
    else next[id] = true;
    setFavorites(next);
    await saveVotes(next);
  };

  const favoriteStories = library.filter((s) => favorites[s.id]);

  let screen = null;
  if (view === "home") screen = <HomeScreen onNavigate={setView} favorites={favoriteStories} />;
  if (view === "library")
    screen = (
      <LibraryScreen
        onNavigate={setView}
        library={library}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        speak={speak}
      />
    );
  if (view === "create")
    screen = <CreateScreen onNavigate={setView} onStoryAdded={setLibrary} currentLibrary={library} />;
  if (view === "about") screen = <AboutScreen onNavigate={setView} />;
  if (view === "contact") screen = <ContactScreen onNavigate={setView} />;

  return (
    <>
      <StatusBar style="dark" />
      {screen}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  screenNight: { backgroundColor: COLORS.night1 },
  scroll: { padding: 20, paddingBottom: 40 },
  heroEmoji: { fontSize: 56, textAlign: "center", marginBottom: 8 },
  heroTitle: { fontSize: 28, fontWeight: "700", textAlign: "center", color: COLORS.text, marginBottom: 8 },
  heroSub: { fontSize: 15, textAlign: "center", color: COLORS.muted, fontStyle: "italic", marginBottom: 20, lineHeight: 22 },
  btnWrap: { borderRadius: 16, overflow: "hidden" },
  btnGrad: { paddingVertical: 14, paddingHorizontal: 20, alignItems: "center" },
  btnOutline: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  btnText: { fontSize: 16, fontWeight: "600", color: COLORS.text },
  btnTextPrimary: { color: "#fff" },
  btnTextNight: { color: "#fff" },
  disabled: { opacity: 0.5 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb24: { marginBottom: 24 },
  mt16: { marginTop: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text, marginBottom: 12 },
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroImg: { width: "100%", height: 85, borderRadius: 10, marginBottom: 8 },
  storyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardImg: { width: "100%", height: 110, borderRadius: 10, marginBottom: 8 },
  cardMeta: { fontSize: 11, color: COLORS.accent3, fontWeight: "700", textTransform: "uppercase" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: COLORS.text, marginVertical: 4 },
  cardPreview: { fontSize: 13, color: COLORS.muted },
  footerLinks: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 24 },
  link: { color: COLORS.muted, textDecorationLine: "underline" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  nightToggle: { fontSize: 14, color: COLORS.accent4 },
  textNight: { color: "#fff" },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: COLORS.muted, marginBottom: 16, textAlign: "center" },
  stepHint: { textAlign: "center", color: COLORS.muted, marginBottom: 16, fontSize: 15 },
  note: { textAlign: "center", color: "#ccc", fontSize: 12, marginTop: 12 },
  previewImg: { width: "100%", height: 180, borderRadius: 14, marginBottom: 16, backgroundColor: "#fff" },
  ageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  ageBtn: {
    width: "48%",
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
  },
  ageBtnOn: { borderColor: COLORS.accent1, backgroundColor: "rgba(255,107,107,0.08)" },
  ageEmoji: { fontSize: 24 },
  ageLabel: { fontWeight: "700", color: COLORS.text },
  ageRange: { fontSize: 12, color: COLORS.muted },
  error: { color: COLORS.accent1, textAlign: "center", marginBottom: 12 },
  centered: { alignItems: "center", paddingVertical: 32 },
  storyHeading: { fontSize: 22, fontWeight: "700", color: COLORS.text, marginBottom: 12 },
  thumb: { width: 76, height: 76, borderRadius: 11, marginBottom: 12 },
  storyPara: { fontSize: 16, lineHeight: 26, color: COLORS.text, marginBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24, maxHeight: "90%" },
  modalCardNight: { backgroundColor: COLORS.night2 },
  modalClose: { alignSelf: "flex-end" },
  modalCloseText: { fontSize: 22, color: COLORS.muted },
  modalMeta: { fontSize: 11, color: COLORS.accent3, fontWeight: "700", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: COLORS.text, marginBottom: 12 },
  modalBody: { color: COLORS.muted, marginBottom: 16, lineHeight: 22 },
  modalImg: { width: "100%", height: 160, borderRadius: 14, marginBottom: 12 },
  reactionRow: { flexDirection: "row", justifyContent: "center", marginTop: 14 },
  favBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  favBtnOn: { borderColor: COLORS.accent1, backgroundColor: "rgba(255,107,107,0.08)" },
  favText: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  input: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  aboutPara: { fontSize: 16, lineHeight: 24, color: COLORS.text, marginBottom: 16 },
  socialBtn: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    backgroundColor: COLORS.card,
  },
  socialText: { fontSize: 16, fontWeight: "600", color: COLORS.text },
  langBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.accent4,
    backgroundColor: COLORS.card,
    alignItems: "center",
    marginBottom: 8,
  },
  langBtnText: { fontSize: 15, fontWeight: "600", color: COLORS.accent4 },
  langModalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  langRowOn: { backgroundColor: "rgba(77,150,255,0.10)" },
  langRowText: { fontSize: 16, color: COLORS.text },
});
