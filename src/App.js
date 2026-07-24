import { useState, useRef, useCallback, useEffect } from "react";
import { useSpeech, prefetchStoryTTS, useTtsErrorBanner, stopAllSpeech } from "./tts";
import { VOICE_LINES } from "./voiceLines";
import PaywallModal from "./components/PaywallModal";
import SuccessScreen from "./components/SuccessScreen";
import PrivacyPolicyScreen from "./components/PrivacyPolicyScreen";
import TermsOfServiceScreen from "./components/TermsOfServiceScreen";

// ── Constants ────────────────────────────────────────────────────
const AGE_GROUPS = [
  { label: "Tiny Tots",      range: "2–4",  emoji: "🍼", prompt: "very simple, 2-3 sentences, magical and whimsical, easy words" },
  { label: "Little Readers", range: "5–7",  emoji: "📚", prompt: "3-4 short paragraphs, adventurous and fun, simple vocabulary" },
  { label: "Story Lovers",   range: "8–10", emoji: "🌟", prompt: "4-5 paragraphs, imaginative with some twists, richer vocabulary" },
  { label: "Big Kids",       range: "11–13",emoji: "🚀", prompt: "5-6 paragraphs, exciting plot with a surprise ending, expressive language" },
];

const PALETTE = [
  "#000000","#FFFFFF","#FF6B6B","#FF8E53","#FFD93D","#6BCB77",
  "#4D96FF","#9B59B6","#FF69B4","#A0522D","#708090","#00CED1",
];

const BRUSH_SIZES = [3, 7, 13, 20];

const TTS_LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch",
  "Russian", "Mandarin Chinese", "Japanese", "Korean", "Arabic", "Hindi", "Turkish",
  "Polish", "Swedish", "Norwegian", "Danish", "Finnish", "Ukrainian", "Greek", "Czech",
  "Romanian", "Hungarian", "Thai", "Vietnamese", "Indonesian", "Malay", "Tagalog", "Hebrew",
];

const COLORS = {
  bg:"#FFF9F0", card:"#FFFFFF",
  accent1:"#FF6B6B", accent2:"#FFD93D", accent3:"#6BCB77", accent4:"#4D96FF", accent5:"#FF4ECD",
  night1:"#1a1035", night2:"#2d1b6e", night3:"#4a2fa0",
  text:"#2D2D2D", muted:"#8A8A8A", border:"#F0E6D3",
};

function GoPremiumButton({ isPremium, setShowPaywall, nightMode, variant = "filled" }) {
  if (isPremium) return null;
  const isOutline = variant === "outline";
  return (
    <button
      type="button"
      onClick={() => setShowPaywall("upsell")}
      style={{
        padding: isOutline ? "5px 14px" : "6px 11px",
        borderRadius: 12,
        border: `1.5px solid ${nightMode ? "rgba(255,217,61,0.45)" : isOutline ? "#D4AF37" : "#E6C200"}`,
        background: isOutline
          ? "transparent"
          : nightMode
            ? "rgba(255,217,61,0.12)"
            : "linear-gradient(135deg,#FFF8E1,#FFEFAA)",
        color: nightMode ? COLORS.accent2 : isOutline ? "#B8860B" : "#9A7200",
        fontSize: isOutline ? "0.7rem" : "0.72rem",
        fontWeight: "bold",
        cursor: "pointer",
        fontFamily: "Georgia,serif",
        whiteSpace: "nowrap",
        boxShadow: isOutline ? "none" : "0 2px 8px rgba(255,217,61,0.22)",
      }}
    >
      ⭐ Go Premium
    </button>
  );
}

// ── Storage (localStorage on web; Expo app uses AsyncStorage in expo/) ──
const STORAGE_KEYS = { library: "doodle-library", votes: "doodle-votes" };

function resolveDoodleUrl(story) {
  if (!story || typeof story !== "object") return null;
  const candidates = [story.doodleUrl, story.image].filter(
    (v) => typeof v === "string" && v.length > 0
  );
  for (const url of candidates) {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("blob:")) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
  }
  return null;
}

function normalizeStoryEntry(story) {
  if (!story || typeof story !== "object") return story;
  return { ...story, doodleUrl: resolveDoodleUrl(story) };
}

function getStoryDoodleUrl(story) {
  return resolveDoodleUrl(story);
}

async function loadLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.library);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map(normalizeStoryEntry);
    const migrated = normalized.some(
      (s, i) => s.doodleUrl !== resolveDoodleUrl(parsed[i])
    );
    if (migrated) {
      console.log("📚 Migrated library entries with recoverable doodle data URLs");
      try {
        localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(normalized));
      } catch (e) {
        console.warn("Could not persist migrated library:", e?.message);
      }
    }
    console.log("📚 Library loaded from localStorage:", normalized.length, "stories");
    return normalized;
  } catch {
    return [];
  }
}

async function saveLibrary(stories) {
  try {
    const sanitized = stories.map((story) => {
      const doodleUrl = getStoryDoodleUrl(story);
      if (doodleUrl?.startsWith("blob:")) {
        console.warn("⚠️ Stripping expired blob doodleUrl before save for story:", story.id);
        return { ...story, doodleUrl: null };
      }
      return doodleUrl !== story.doodleUrl ? { ...story, doodleUrl } : story;
    });
    localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(sanitized));
    const sample = sanitized[0];
    console.log(
      "✅ Library saved to localStorage:",
      sanitized.length,
      "stories | sample doodleUrl:",
      sample?.doodleUrl
        ? `${sample.doodleUrl.startsWith("data:") ? "data:" : sample.doodleUrl.slice(0, 20)}... (${sample.doodleUrl.length} chars)`
        : "none"
    );
  } catch (e) {
    console.error("❌ saveLibrary failed:", e);
    throw e;
  }
}

/** Persist doodle images — blob: URLs expire after the session */
async function blobUrlToDataUrl(blobUrl) {
  if (!blobUrl) return blobUrl;
  if (blobUrl.startsWith("data:")) return blobUrl;
  const blob = await fetch(blobUrl).then((r) => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Shrink doodle for localStorage — full PNG data URLs often exceed quota */
async function compressDoodleDataUrl(dataUrl, maxDim = 480, quality = 0.82) {
  if (!dataUrl?.startsWith("data:")) return dataUrl;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function persistDoodleUrl(image, imageBase64, imageMediaType) {
  let dataUrl = null;
  if (imageBase64) {
    dataUrl = `data:${imageMediaType || "image/png"};base64,${imageBase64}`;
    console.log("🖼️ persistDoodleUrl: built from imageBase64");
  } else if (image) {
    if (image.startsWith("data:")) {
      dataUrl = image;
      console.log("🖼️ persistDoodleUrl: image already a data URL, skipping conversion");
    } else if (image.startsWith("blob:")) {
      console.log("🖼️ persistDoodleUrl: converting blob URL to data URL...");
      dataUrl = await blobUrlToDataUrl(image);
    }
  }
  if (!dataUrl) {
    console.warn("🖼️ persistDoodleUrl: no image data available");
    return null;
  }
  if (dataUrl.startsWith("blob:")) {
    console.error("🖼️ persistDoodleUrl: conversion failed — still a blob URL");
    return null;
  }
  try {
    const compressed = await compressDoodleDataUrl(dataUrl);
    console.log(
      "🖼️ persistDoodleUrl result:",
      compressed.startsWith("data:")
        ? `data:... (${compressed.length} chars)`
        : compressed.slice(0, 40)
    );
    return compressed;
  } catch (err) {
    console.warn("Doodle compress failed, saving original:", err?.message);
    console.log(
      "🖼️ persistDoodleUrl result (uncompressed):",
      dataUrl.startsWith("data:") ? `data:... (${dataUrl.length} chars)` : dataUrl.slice(0, 40)
    );
    return dataUrl;
  }
}

async function loadVotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.votes);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveVotes(v) {
  try {
    localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

// ── Confetti ─────────────────────────────────────────────────────
function Confetti({ active, onDone }) {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id:i, x:Math.random()*100,
    color:["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF4ECD","#FF8E53"][i%6],
    size:Math.random()*8+6, delay:Math.random()*0.4,
    duration:Math.random()*0.8+1, rotate:Math.random()*360,
  }));
  useEffect(() => { if(!active) return; const t=setTimeout(onDone,2200); return ()=>clearTimeout(t); }, [active,onDone]);
  if (!active) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:999,pointerEvents:"none",overflow:"hidden" }}>
      {pieces.map(p=>(
        <div key={p.id} style={{ position:"absolute",left:`${p.x}%`,top:-20,width:p.size,height:p.size,background:p.color,borderRadius:Math.random()>0.5?"50%":2,animation:`confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,transform:`rotate(${p.rotate}deg)` }}/>
      ))}
    </div>
  );
}

// ── Canvas Doodle Pad ─────────────────────────────────────────────
function DoodlePad({ onUse, onCancel }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const lastPos = useRef(null);
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const { speak } = useSpeech();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    speak(VOICE_LINES.draw, 'draw');
  }, []);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    historyRef.current.push(canvas.toDataURL());
    if (historyRef.current.length > 20) historyRef.current.shift();
    setCanUndo(true);
  };

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x:(src.clientX - rect.left)*scaleX, y:(src.clientY - rect.top)*scaleY };
  };

  const floodFill = (ctx, startX, startY, fillColor) => {
    startX = Math.round(startX); startY = Math.round(startY);
    const canvas = canvasRef.current;
    const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const idx = (x,y) => (y*w+x)*4;
    const start = idx(startX, startY);
    const sr=data[start], sg=data[start+1], sb=data[start+2], sa=data[start+3];
    const hex = fillColor.replace("#","");
    const tr=parseInt(hex.slice(0,2),16), tg=parseInt(hex.slice(2,4),16), tb=parseInt(hex.slice(4,6),16);
    if (sr===tr&&sg===tg&&sb===tb) return;
    const match = (i) => Math.abs(data[i]-sr)<30&&Math.abs(data[i+1]-sg)<30&&Math.abs(data[i+2]-sb)<30&&Math.abs(data[i+3]-sa)<30;
    const stack = [[startX,startY]];
    const visited = new Uint8Array(w*canvas.height);
    while (stack.length) {
      const [x,y] = stack.pop();
      if (x<0||x>=w||y<0||y>=canvas.height) continue;
      const i = idx(x,y);
      if (visited[y*w+x]||!match(i)) continue;
      visited[y*w+x]=1;
      data[i]=tr; data[i+1]=tg; data[i+2]=tb; data[i+3]=255;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    ctx.putImageData(imageData,0,0);
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    if (tool==="fill") { saveHistory(); floodFill(ctx, pos.x, pos.y, color); return; }
    saveHistory();
    setDrawing(true);
    lastPos.current = pos;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, BRUSH_SIZES[brushSize]/2, 0, Math.PI*2);
    ctx.fillStyle = tool==="eraser" ? "#FFFFFF" : color;
    ctx.fill();
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing || tool==="fill") return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool==="eraser" ? "#FFFFFF" : color;
    ctx.lineWidth = BRUSH_SIZES[brushSize];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = (e) => { e?.preventDefault(); setDrawing(false); lastPos.current=null; };

  const undo = () => {
    if (!historyRef.current.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const prev = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    const img = new Image();
    img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0); };
    img.src = prev;
  };

  const clearCanvas = () => {
    saveHistory();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0,0,canvas.width,canvas.height);
  };

  const handleUse = () => {
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL("image/png");
    const base64 = dataURL.split(",")[1];
    onUse(dataURL, base64);
  };

  const ToolBtn = ({ id, icon, label }) => (
    <button onClick={()=>setTool(id)} title={label} style={{
      width:40, height:40, borderRadius:12,
      border:`2px solid ${tool===id?COLORS.accent1:COLORS.border}`,
      background:tool===id?"rgba(255,107,107,0.1)":"white",
      cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:tool===id?`0 3px 10px rgba(255,107,107,0.3)`:"none",
      transition:"all 0.15s",
    }}>{icon}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      <div style={{ background:"white", borderRadius:"20px 20px 0 0", padding:"12px 16px", border:`2px solid ${COLORS.border}`, borderBottom:"none", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:6 }}>
          <ToolBtn id="brush" icon="✏️" label="Brush"/>
          <ToolBtn id="eraser" icon="🧹" label="Eraser"/>
          <ToolBtn id="fill" icon="🪣" label="Fill"/>
        </div>
        <div style={{ width:1, height:32, background:COLORS.border }}/>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          {BRUSH_SIZES.map((sz,i)=>(
            <button key={i} onClick={()=>setBrushSize(i)} style={{ width:sz+10, height:sz+10, minWidth:18, minHeight:18, maxWidth:36, maxHeight:36, borderRadius:"50%", border:`2px solid ${brushSize===i?COLORS.accent1:COLORS.border}`, background:brushSize===i?color:"white", cursor:"pointer", transition:"all 0.15s", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:sz/1.5, height:sz/1.5, borderRadius:"50%", background:brushSize===i?"white":color }}/>
            </button>
          ))}
        </div>
        <div style={{ width:1, height:32, background:COLORS.border }}/>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setShowPalette(p=>!p)} style={{ width:36, height:36, borderRadius:10, border:`3px solid ${COLORS.border}`, background:color, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.15)", transition:"transform 0.15s" }}/>
          {showPalette && (
            <div style={{ position:"absolute", top:44, left:0, zIndex:10, background:"white", borderRadius:14, padding:10, border:`2px solid ${COLORS.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, width:160 }}>
              {PALETTE.map(c=>(
                <button key={c} onClick={()=>{ setColor(c); setShowPalette(false); }} style={{ width:30, height:30, borderRadius:8, border:`3px solid ${color===c?COLORS.accent1:"transparent"}`, background:c, cursor:"pointer", boxShadow:c==="#FFFFFF"?"inset 0 0 0 1px #eee":"none", transform:color===c?"scale(1.15)":"scale(1)", transition:"all 0.12s" }}/>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          <button onClick={undo} disabled={!canUndo} title="Undo" style={{ width:36,height:36,borderRadius:10,border:`2px solid ${COLORS.border}`,background:"white",cursor:canUndo?"pointer":"not-allowed",fontSize:16,opacity:canUndo?1:0.4 }}>↩️</button>
          <button onClick={clearCanvas} title="Clear" style={{ width:36,height:36,borderRadius:10,border:`2px solid ${COLORS.border}`,background:"white",cursor:"pointer",fontSize:16 }}>🗑️</button>
        </div>
      </div>
      <div style={{ position:"relative", lineHeight:0 }}>
        <canvas ref={canvasRef} width={600} height={400}
          style={{ width:"100%", aspectRatio:"3/2", display:"block", cursor:tool==="fill"?"crosshair":tool==="eraser"?"cell":"default", borderLeft:`2px solid ${COLORS.border}`, borderRight:`2px solid ${COLORS.border}`, touchAction:"none", background:"white" }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}/>
        <div style={{ position:"absolute", top:8, right:10, background:"rgba(0,0,0,0.35)", color:"white", fontSize:"0.72rem", borderRadius:8, padding:"3px 10px", pointerEvents:"none" }}>
          {tool==="brush"?"✏️ Drawing":tool==="eraser"?"🧹 Erasing":"🪣 Filling"}
        </div>
      </div>
      <div style={{ background:"white", borderRadius:"0 0 20px 20px", padding:"12px 16px", border:`2px solid ${COLORS.border}`, borderTop:"none", display:"flex", gap:10 }}>
        <button onClick={onCancel} style={{ flex:1, padding:"12px", borderRadius:14, border:`2px solid ${COLORS.border}`, background:"transparent", cursor:"pointer", color:COLORS.muted, fontSize:"0.9rem", fontFamily:"Georgia,serif" }}>← Back</button>
        <button onClick={handleUse} style={{ flex:2, padding:"12px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`, color:"white", fontSize:"0.95rem", fontWeight:"bold", cursor:"pointer", boxShadow:"0 6px 20px rgba(255,107,107,0.35)", fontFamily:"Georgia,serif" }}>✨ Use This Doodle!</button>
      </div>
    </div>
  );
}

// ── Stars ────────────────────────────────────────────────────────
function StarryBg() {
  const stars = Array.from({length:40},(_,i)=>({id:i,x:Math.random()*100,y:Math.random()*100,size:Math.random()*2.5+1,delay:Math.random()*3}));
  return (
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}>
      {stars.map(s=><div key={s.id} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,width:s.size,height:s.size,borderRadius:"50%",background:"white",opacity:0.6,animation:`twinkle 2s ${s.delay}s infinite alternate`}}/>)}
    </div>
  );
}

// ── Doodle image with placeholder fallback ───────────────────────
function DoodleImage({ src, alt = "doodle", style, nightMode, placeholderLabel = "Doodle" }) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 4,
          background: nightMode
            ? "rgba(255,255,255,0.08)"
            : "linear-gradient(135deg,#FFF8E1,#E8F4FF)",
          border: `2px dashed ${nightMode ? "rgba(255,255,255,0.2)" : COLORS.border}`,
          color: nightMode ? "rgba(255,255,255,0.45)" : COLORS.muted,
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>🎨</span>
        <span style={{ fontSize: "0.62rem", fontFamily: "Georgia,serif", letterSpacing: "0.04em" }}>
          {placeholderLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => {
        console.warn("Doodle image failed to load:", src?.slice(0, 60));
        setFailed(true);
      }}
    />
  );
}

// ── Badge ────────────────────────────────────────────────────────
function Badge({ likes=0, loves=0, small=false }) {
  if (!likes&&!loves) return null;
  const sz=small?"0.72rem":"0.82rem", pd=small?"3px 8px":"4px 10px";
  return (
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
      {loves>=10&&<span style={{padding:pd,borderRadius:20,background:"linear-gradient(135deg,#FF4ECD,#FF8E53)",color:"white",fontSize:sz,fontWeight:"bold"}}>🏆 Top Loved</span>}
      {likes>=5&&<span style={{padding:pd,borderRadius:20,background:"linear-gradient(135deg,#FFD93D,#FF8E53)",color:"white",fontSize:sz,fontWeight:"bold"}}>⭐ Popular</span>}
      {loves>0&&<span style={{padding:pd,borderRadius:20,background:"rgba(255,78,205,0.12)",color:COLORS.accent5,fontSize:sz,fontWeight:"bold"}}>❤️ {loves}</span>}
      {likes>0&&<span style={{padding:pd,borderRadius:20,background:"rgba(255,217,61,0.15)",color:"#b8860b",fontSize:sz,fontWeight:"bold"}}>👍 {likes}</span>}
    </div>
  );
}

// ── Reaction Buttons ─────────────────────────────────────────────
function ReactionButtons({ story, votes, onVote, nightMode }) {
  const myVote=votes[story.id];
  const btn={padding:"10px 18px",borderRadius:20,border:"2px solid",cursor:"pointer",fontSize:"0.95rem",fontWeight:"bold",transition:"all 0.2s",fontFamily:"Georgia,serif",display:"flex",alignItems:"center",gap:6};
  return (
    <div style={{display:"flex",gap:10,justifyContent:"center",margin:"16px 0"}}>
      <button disabled={!!myVote} onClick={()=>onVote(story.id,"like")} style={{...btn,borderColor:myVote==="like"?COLORS.accent2:(nightMode?"rgba(255,255,255,0.2)":COLORS.border),background:myVote==="like"?"rgba(255,217,61,0.2)":"transparent",color:myVote==="like"?"#b8860b":(nightMode?"white":COLORS.text),opacity:myVote&&myVote!=="like"?0.4:1,transform:myVote==="like"?"scale(1.08)":"scale(1)"}}>
        👍 {myVote==="like"?"Liked!":"Like"} · {story.likes||0}
      </button>
      <button disabled={!!myVote} onClick={()=>onVote(story.id,"love")} style={{...btn,borderColor:myVote==="love"?COLORS.accent5:(nightMode?"rgba(255,255,255,0.2)":COLORS.border),background:myVote==="love"?"rgba(255,78,205,0.15)":"transparent",color:myVote==="love"?COLORS.accent5:(nightMode?"white":COLORS.text),opacity:myVote&&myVote!=="love"?0.4:1,transform:myVote==="love"?"scale(1.08)":"scale(1)"}}>
        ❤️ {myVote==="love"?"Loved!":"Love"} · {story.loves||0}
      </button>
    </div>
  );
}

// ── Story Card ───────────────────────────────────────────────────
function StoryCard({ story, onRead, nightMode, votes, onVote, highlight }) {
  const isTop=(story.loves||0)>=5||(story.likes||0)>=5;
  return (
    <div onClick={()=>onRead(story)} style={{background:highlight?(nightMode?"rgba(255,78,205,0.1)":"rgba(255,78,205,0.05)"):(nightMode?"rgba(255,255,255,0.07)":COLORS.card),border:`2px solid ${highlight?COLORS.accent5:(nightMode?"rgba(255,255,255,0.12)":COLORS.border)}`,borderRadius:20,padding:"16px 18px",cursor:"pointer",transition:"all 0.2s",boxShadow:highlight?`0 4px 20px rgba(255,78,205,0.2)`:(nightMode?"0 4px 20px rgba(0,0,0,0.3)":"0 4px 16px rgba(0,0,0,0.06)"),position:"relative"}}
    onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
      {isTop&&<div style={{position:"absolute",top:-10,right:12,fontSize:"1.1rem"}}>{(story.loves||0)>=5?"🏆":"⭐"}</div>}
      <DoodleImage
        src={getStoryDoodleUrl(story)}
        nightMode={nightMode}
        style={{width:"100%",height:110,objectFit:"cover",borderRadius:10,marginBottom:10,border:`3px solid ${nightMode?"rgba(255,255,255,0.15)":"white"}`,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}
      />
      <div style={{fontSize:"0.68rem",color:nightMode?COLORS.accent2:COLORS.accent3,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>{story.ageEmoji} {story.ageLabel}</div>
      <h3 style={{margin:"0 0 5px",fontSize:"0.92rem",color:nightMode?"white":COLORS.text,lineHeight:1.3}}>{story.title}</h3>
      <p style={{margin:"0 0 8px",fontSize:"0.76rem",color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted,lineHeight:1.4}}>{story.preview}</p>
      <Badge likes={story.likes||0} loves={story.loves||0} small/>
      <div style={{marginTop:7,fontSize:"0.68rem",color:nightMode?"rgba(255,255,255,0.3)":"#ccc"}}>🌙 {story.date}</div>
    </div>
  );
}

// ── Reading Modal ────────────────────────────────────────────────
function ReadingModal({ story, onClose, nightMode, votes, onVote }) {
  const { speakLong, stop } = useSpeech();
  const [storyReading, setStoryReading] = useState(false);
  const isStoppingRef = useRef(false);
  useEffect(()=>()=>{ stop(); setStoryReading(false); },[stop]);
  useEffect(() => {
    const doodleUrl = getStoryDoodleUrl(story);
    console.log("📖 Opened library story:", {
      id: story?.id,
      title: story?.title,
      doodleUrl: doodleUrl
        ? `${doodleUrl.startsWith("data:") ? "data:" : doodleUrl.slice(0, 24)}... (${doodleUrl.length} chars)`
        : null,
      rawDoodleUrl: story?.doodleUrl?.slice(0, 24) ?? null,
      rawImage: story?.image?.slice(0, 24) ?? null,
    });
  }, [story]);

  const handleStartReading = async () => {
    if (isStoppingRef.current) return;
    setStoryReading(true);
    try {
      await speakLong(`${story.title}. ${story.text}`);
    } finally {
      if (!isStoppingRef.current) setStoryReading(false);
    }
  };

  const handleReadAloud = () => {
    if (storyReading) {
      isStoppingRef.current = true;
      stop();
      setStoryReading(false);
      setTimeout(() => { isStoppingRef.current = false; }, 500);
      return;
    }
    if (isStoppingRef.current) return;
    handleStartReading();
  };
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:nightMode?"#1e1245":"white",borderRadius:28,padding:"28px 32px",maxWidth:580,width:"100%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.4)",border:`2px solid ${nightMode?"rgba(255,255,255,0.1)":COLORS.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:"0.7rem",color:nightMode?COLORS.accent2:COLORS.accent3,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3}}>{story.ageEmoji} {story.ageLabel} · Bedtime Story</div>
            <h2 style={{margin:0,color:nightMode?"white":COLORS.text,fontSize:"1.35rem",lineHeight:1.2}}>{story.title}</h2>
            <div style={{marginTop:7}}><Badge likes={story.likes||0} loves={story.loves||0}/></div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted}}>✕</button>
        </div>
        <DoodleImage
          src={getStoryDoodleUrl(story)}
          nightMode={nightMode}
          style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:14,marginBottom:18,border:`4px solid ${nightMode?"rgba(255,255,255,0.1)":"white"}`,boxShadow:"0 6px 20px rgba(0,0,0,0.15)"}}
        />
        <button onClick={handleReadAloud} style={{width:"100%",padding:"11px",borderRadius:14,border:"none",marginBottom:4,background:storyReading?`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`,color:"white",fontSize:"0.95rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>
          {storyReading?"⏹ Stop Reading":"🔊 Read This Story Aloud"}
        </button>
        <ReactionButtons story={story} votes={votes} onVote={onVote} nightMode={nightMode}/>
        <div style={{lineHeight:1.9}}>
          {story.text.split("\n\n").map((para,i)=>(
            <p key={i} style={{margin:"0 0 13px",color:nightMode?"rgba(255,255,255,0.85)":COLORS.text,fontSize:"1rem"}}>
              {i===0&&<span style={{fontSize:"2.1rem",float:"left",lineHeight:0.8,marginRight:5,color:COLORS.accent1,fontWeight:"bold"}}>{para.charAt(0)}</span>}
              {i===0?para.slice(1):para}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Save Modal ───────────────────────────────────────────────────
function SaveModal({ story, onSave }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"white",borderRadius:28,padding:"30px 34px",maxWidth:420,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,0.25)",textAlign:"center"}}>
        <div style={{fontSize:46,marginBottom:10}}>🌙</div>
        <h2 style={{margin:"0 0 10px",color:COLORS.text,fontSize:"1.25rem"}}>Save this story?</h2>
        <p style={{color:COLORS.muted,fontSize:"0.9rem",lineHeight:1.6,margin:"0 0 22px"}}>
          Save <strong style={{color:COLORS.text}}>"{story.title}"</strong> to your Bedtime Story Library
              so you can read and listen to it again anytime. It stays on this device — nothing is shared.
        </p>
        <div style={{display:"flex",gap:10,flexDirection:"column"}}>
          <button onClick={()=>onSave(true)} style={{padding:"13px",borderRadius:16,border:"none",background:`linear-gradient(135deg,${COLORS.accent3},#3BB54A)`,color:"white",fontSize:"1rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 6px 20px rgba(107,203,119,0.35)",fontFamily:"Georgia,serif"}}>✨ Yes, save it!</button>
          <button onClick={()=>onSave(false)} style={{padding:"13px",borderRadius:16,border:`2px solid ${COLORS.border}`,background:"transparent",color:COLORS.muted,fontSize:"1rem",cursor:"pointer"}}> Not now </button>
        </div>
      </div>
    </div>
  );
}

// ── HOME ─────────────────────────────────────────────────────────
function HomeScreen({ onNavigate, isPremium, setShowPaywall }) {
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    const lockScroll = () => window.matchMedia("(min-width: 481px)").matches;
    if (lockScroll()) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  return (
    <div
      className="home-screen-root"
      style={{
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: `radial-gradient(ellipse at 15% 10%, #FFE8D6 0%, #FFF9F0 45%, #E8F4FF 100%)`,
        fontFamily: "Georgia,serif",
      }}
    >
      <style>{`
        .home-screen-root,
        .home-screen-root * { box-sizing: border-box; }
        @keyframes homeFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        .home-inner {
          flex:1; min-height:0; display:flex; flex-direction:column; justify-content:flex-start;
          gap:8px; padding:14px 20px 10px; max-width:620px; width:100%; margin:0 auto;
          position:relative; z-index:1;
        }
        .home-topbar { display:flex; align-items:center; justify-content:center; gap:10px; flex-shrink:0; width:100%; }
        .home-brand { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0; flex:none; overflow:visible; width:100%; margin:0 auto; text-align:center; }
        .home-brand-row { display:flex; flex-direction:row; align-items:center; gap:8px; align-self:center; }
        .home-brand-text { min-width:0; flex:1; overflow:visible; }
        .home-brand-emoji { font-size:2.2rem; line-height:1; flex-shrink:0; animation:homeFloat 3s ease-in-out infinite; }
        .home-brand-title { font-size:1.45rem; color:${COLORS.text}; margin:0; line-height:1.15; letter-spacing:-0.02em; }
        .home-brand-tagline {
          color:#666; font-size:0.74rem; font-style:italic; margin:0; line-height:1.25;
          white-space:normal; overflow:visible; text-align:center; width:100%; align-self:stretch;
        }
        .home-top-section { flex-shrink:0; display:flex; flex-direction:column; gap:0; background:none; border:none; padding:0; margin:0; }
        .home-lang { flex-shrink:0; margin:0 auto; display:block; width:100%; }
        .home-lang-label {
          display:block; font-size:0.85rem; color:#444; font-weight:500; margin-bottom:4px;
          text-align:center;
        }
        .home-lang select {
          width:100%; padding:6px 12px; border-radius:999px;
          border:1.5px solid ${COLORS.border}; background:rgba(255,255,255,0.85);
          color:${COLORS.muted}; font-size:0.78rem; font-family:Georgia,serif;
          cursor:pointer; appearance:auto; box-shadow:none;
        }
        .home-hero {
          flex:0 0 auto; min-height:0; display:flex; flex-direction:column; gap:10px;
          justify-content:flex-start; margin-top:8px; padding:0; width:100%; overflow:hidden;
        }
        .home-card {
          flex:1; min-height:0;
          display:flex; flex-direction:column; justify-content:center; align-items:center;
          height:100%; width:100%;
          text-align:center;
          border:none; border-radius:22px; padding:14px 20px; cursor:pointer;
          font-family:Georgia,serif; transition:transform 0.18s ease, box-shadow 0.18s ease;
          position:relative; overflow:hidden;
        }
        .home-card-inner {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          width:100%; margin:0; padding:0;
          position:relative; z-index:1;
        }
        .home-card-inner p { margin:0; }
        .home-card:hover { transform:translateY(-2px) scale(1.01); }
        .home-card-create {
          background:linear-gradient(145deg, ${COLORS.accent1} 0%, #FF8E53 100%);
          color:white; box-shadow:0 10px 32px rgba(255,107,107,0.35);
        }
        .home-card-create:hover { box-shadow:0 14px 40px rgba(255,107,107,0.42); }
        .home-card-library {
          background:linear-gradient(145deg, ${COLORS.night2} 0%, ${COLORS.night3} 100%);
          color:white; box-shadow:0 10px 32px rgba(45,27,110,0.32);
        }
        .home-card-library:hover { box-shadow:0 14px 40px rgba(45,27,110,0.4); }
        .home-card-emoji { font-size:clamp(2rem, 6vw, 2.75rem); line-height:1; margin:0 0 6px; position:relative; z-index:1; }
        .home-card-title { font-size:clamp(0.95rem, 3.2vw, 1.12rem); font-weight:bold; line-height:1.25; margin:0 0 4px; position:relative; z-index:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .home-card-desc { font-size:0.76rem; line-height:1.35; opacity:0.92; margin:0; max-width:100%; position:relative; z-index:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .home-bottom { flex-shrink:0; display:flex; flex-direction:column; gap:6px; margin-top:auto; }
        .home-welcome {
          display:block; text-align:center; color:#555; font-size:0.78rem; line-height:1.3;
          margin-top:56px !important; margin-bottom:0; padding:0 0 8px; width:100%;
          background:transparent; border:none; min-height:0; height:auto;
          box-shadow:none; border-radius:0;
          white-space:normal; overflow:visible; text-overflow:clip;
        }
        .home-footer {
          display:flex; flex-direction:column; align-items:center; gap:6px;
          text-align:center; color:#333; font-size:0.85rem; line-height:1.35;
          padding:12px 0; white-space:normal; overflow:visible;
        }
        .home-footer-prefix { color:#666; font-size:0.85rem; }
        .home-footer-links { font-weight:600; color:#222; }
        .home-footer button {
          background:none; border:none; cursor:pointer; color:#222; font-weight:600;
          font-size:inherit; font-family:Georgia,serif; text-decoration:none; padding:0;
        }
        .home-footer button:hover { text-decoration:underline; }
        .home-footer-sep { font-weight:bold; }
        .home-screen-root { position:relative; height:auto; min-height:unset; overflow:visible; }
        .home-premium-float { display:none; }
        @media (min-width: 481px) {
          .home-screen-root { min-height:100dvh; height:100dvh; overflow:hidden; }
          .home-premium-float {
            display:block !important; position:absolute; top:16px; right:24px; z-index:20;
          }
          .home-topbar {
            margin-top:48px; align-items:center; width:100%; overflow:visible;
            justify-content:center;
          }
          .home-brand {
            flex:none; margin:0 auto; text-align:center;
            flex-direction:column; align-items:center; gap:4px;
            min-width:0; max-width:none; overflow:visible;
          }
          .home-brand-row {
            display:flex; flex-direction:row; align-items:center; gap:8px;
          }
          .home-brand-emoji {
            font-size:4rem; line-height:1; display:flex; align-items:center;
            margin-top:2px; padding-top:0;
          }
          .home-brand-title { font-size:2.2rem; margin:0; }
          .home-brand-tagline {
            color:#666; font-size:1rem;
            white-space:normal; overflow:visible; text-overflow:clip; max-width:100%;
            margin:0;
          }
          .home-top-section { display:flex; flex-direction:column; gap:0; }
          .home-welcome {
            font-size:0.95rem !important;
          }
          .home-lang-label { font-size:1rem; }
          .home-footer { font-size:0.9rem !important; padding:16px 0 !important; }
          .home-inner { max-width:620px; }
          .home-hero {
            height:280px; min-height:280px; max-height:280px;
            margin-top:24px; justify-content:center;
          }
          .home-card { height:100%; padding:20px 22px; }
          .home-card-inner { flex:none; align-self:center; }
          .home-card-emoji { margin:0 0 6px; }
          .home-card-title { font-size:1.1rem; line-height:1.2; }
          .home-card-desc { font-size:0.9rem; opacity:1; }
        }
        @media (min-width: 560px) {
          .home-hero { flex-direction:row; gap:14px; }
        }
        @media (max-width: 480px) {
          .home-screen-root {
            display:flex; flex-direction:column;
            min-height:100dvh; height:auto; overflow:visible;
            padding-top:16px;
          }
          .home-blob { display:none; }
          .home-premium-float {
            display:block !important; position:absolute; top:12px; right:12px; z-index:20;
          }
          .home-inner { flex:1; min-height:0; padding:60px 20px 24px; }
          .home-bottom { margin-top:0; overflow:visible; }
          .home-hero {
            flex:1; max-height:320px; min-height:0;
            margin-top:20px; align-items:center; width:100%;
            justify-content:center;
          }
          .home-brand { margin-top:16px; }
          .home-brand-title { font-size:2rem; }
          .home-brand-tagline {
            display:block; text-align:center; width:100%;
          }
          .home-card { flex:0 0 auto; height:auto; max-height:150px !important; }
        }
        @media (max-height: 680px) {
          .home-hero { gap:10px; }
          .home-card { border-radius:18px; padding:12px 14px; }
          .home-card-emoji { margin-bottom:5px; }
        }
        @media (max-height: 680px) and (min-width: 481px) {
          .home-brand-emoji { font-size:1.9rem; }
          .home-brand-title { font-size:1.3rem; }
          .home-inner { padding:10px 16px 8px; }
        }
      `}</style>


      <div className="home-blob" style={{ position:"absolute", top:-60, right:-60, width:180, height:180, borderRadius:"50%", background:"rgba(255,217,61,0.14)", zIndex:0, pointerEvents:"none" }}/>
      <div className="home-blob" style={{ position:"absolute", bottom:-40, left:-40, width:140, height:140, borderRadius:"50%", background:"rgba(77,150,255,0.10)", zIndex:0, pointerEvents:"none" }}/>

      <div className="home-premium-float">
        <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} variant="outline" />
      </div>

      <div className="home-inner">
        <div className="home-top-section">
          <div className="home-topbar">
            <div className="home-brand">
              <div className="home-brand-row">
                <div className="home-brand-emoji" aria-hidden="true">🎨</div>
                <h1 className="home-brand-title">
                  Doodle <span style={{ color:COLORS.accent1 }}>Stories</span>
                </h1>
              </div>
              <p className="home-brand-tagline">Draw it. Upload it. Watch the magic happen. 🌙</p>
            </div>
          </div>
          <p className="home-welcome">✨ Welcome! Choose your adventure below.</p>
        </div>

        <div className="home-hero">
          <button type="button" className="home-card home-card-create" onClick={()=>onNavigate("create")}>
            <div className="home-card-inner">
              <div className="home-card-emoji">🖼️</div>
              <p className="home-card-title">Create a Story</p>
              <p className="home-card-desc">Watch your drawing come to life</p>
            </div>
          </button>
          <button type="button" className="home-card home-card-library" onClick={()=>onNavigate("library")}>
            <div className="home-card-inner">
              <div className="home-card-emoji">🌙</div>
              <p className="home-card-title">Bedtime Story Library</p>
              <p className="home-card-desc">Revisit your magical stories anytime</p>
            </div>
          </button>
        </div>

        <div className="home-bottom">
          <div className="home-footer">
            <div className="home-footer-prefix">Made with ❤️</div>
            <div className="home-footer-links">
              <button type="button" onClick={()=>onNavigate("about")}>About</button>
              <span className="home-footer-sep"> · </span>
              <button type="button" onClick={()=>onNavigate("contact")}>Contact</button>
              <span className="home-footer-sep"> · </span>
              <button type="button" onClick={()=>onNavigate("privacy")}>Privacy</button>
              <span className="home-footer-sep"> · </span>
              <button type="button" onClick={()=>onNavigate("terms")}>Terms</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LIBRARY ──────────────────────────────────────────────────────
function LibraryScreen({ onNavigate, library, votes, onVote, speak, isPremium, setShowPaywall }) {
  const [tab, setTab] = useState("all");
  const [filterAge, setFilterAge] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [readingStory, setReadingStory] = useState(null);
  const [nightMode, setNightMode] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const spokenLib = useRef(false);
  const libMascotTimerRef = useRef(null);

  useEffect(()=>{
    if(spokenLib.current) return;
    spokenLib.current=true;
    libMascotTimerRef.current=setTimeout(()=>{
      libMascotTimerRef.current=null;
      speak(VOICE_LINES.library,'library');
    },500);
    return()=>{ if(libMascotTimerRef.current) clearTimeout(libMascotTimerRef.current); };
  },[speak]);

  useEffect(()=>{
    const cancel=()=>{ if(libMascotTimerRef.current) clearTimeout(libMascotTimerRef.current); };
    document.addEventListener("pointerdown",cancel,true);
    return()=>document.removeEventListener("pointerdown",cancel,true);
  },[]);

  const handleVote = (id, type) => {
    onVote(id, type);
    setShowConfetti(true);
    speak(type==="love"?VOICE_LINES.loved:VOICE_LINES.liked, type==="love"?"loved":"liked");
    if (readingStory?.id===id) {
      setReadingStory(s => s ? { ...s, [type==="love"?"loves":"likes"]: (s[type==="love"?"loves":"likes"]||0)+1 } : s);
    }
  };

  const sorted = tab==="loved"
    ? [...library].sort((a,b)=>(b.loves||0)-(a.loves||0)).filter(s=>(s.loves||0)>0)
    : tab==="liked"
      ? [...library].sort((a,b)=>(b.likes||0)-(a.likes||0)).filter(s=>(s.likes||0)>0)
      : [...library];

  const filtered = sorted.filter(s => {
    const ageMatch = filterAge==="all" || s.ageLabel===filterAge;
    const q = searchQuery.toLowerCase();
    return ageMatch && (!q || s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q) || (s.tags||[]).some(t=>t.toLowerCase().includes(q)));
  });

  const lovedCount = library.filter(s=>(s.loves||0)>0).length;
  const likedCount = library.filter(s=>(s.likes||0)>0).length;

  const nBg = nightMode
    ? `linear-gradient(160deg,${COLORS.night1} 0%,${COLORS.night2} 60%,#0d0826 100%)`
    : `radial-gradient(ellipse at 20% 20%,#E8F4FF 0%,#FFF9F0 60%,#FFE8D6 100%)`;

  const TabBtn = ({ id, label, count }) => (
    <button onClick={()=>setTab(id)} style={{
      padding:"8px 16px", borderRadius:20, border:"none", cursor:"pointer",
      fontSize:"0.82rem", fontWeight:"bold", fontFamily:"Georgia,serif", transition:"all 0.15s",
      background: tab===id
        ? (id==="loved" ? `linear-gradient(135deg,${COLORS.accent5},#FF8E53)`
          : id==="liked" ? `linear-gradient(135deg,${COLORS.accent2},#FF8E53)`
          : `linear-gradient(135deg,${COLORS.accent4},#7B61FF)`)
        : (nightMode?"rgba(255,255,255,0.08)":"white"),
      color: tab===id ? "white" : (nightMode?"rgba(255,255,255,0.6)":COLORS.muted),
      boxShadow: tab===id ? "0 4px 14px rgba(0,0,0,0.15)" : "none",
      display:"flex", alignItems:"center", gap:5,
    }}>
      {label}
      {count>0 && (
        <span style={{
          background: tab===id ? "rgba(255,255,255,0.3)" : (nightMode?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.1)"),
          borderRadius:20, padding:"1px 7px", fontSize:"0.7rem", fontWeight:"bold",
        }}>{count}</span>
      )}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:nBg,fontFamily:"Georgia,serif",position:"relative",overflow:"hidden",transition:"background 0.5s"}}>
      {nightMode&&<StarryBg/>}
      <Confetti active={showConfetti} onDone={()=>setShowConfetti(false)}/>
      <div style={{position:"relative",zIndex:1,maxWidth:820,margin:"0 auto",padding:"30px 20px 60px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${nightMode?"rgba(255,255,255,0.2)":COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:nightMode?"white":COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
          <div style={{textAlign:"center"}}>
            <h1 style={{margin:0,fontSize:"clamp(1.2rem,4vw,1.8rem)",color:nightMode?"white":COLORS.text}}>🌙 Bedtime Library</h1>
            <p style={{margin:"2px 0 0",fontSize:"0.74rem",color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted,fontStyle:"italic"}}>{library.length} {library.length===1?"story":"stories"} · by kids, for kids</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} nightMode={nightMode} />
            <button onClick={()=>setNightMode(n=>!n)} style={{background:nightMode?"rgba(255,255,255,0.1)":COLORS.card,border:`2px solid ${nightMode?"rgba(255,255,255,0.2)":COLORS.border}`,borderRadius:12,padding:"7px 12px",cursor:"pointer",color:nightMode?"white":COLORS.text,fontSize:"0.95rem"}}>{nightMode?"☀️":"🌙"}</button>
          </div>
        </div>

        <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
          <TabBtn id="all"   label="✨ All Stories" count={library.length}/>
          <TabBtn id="loved" label="❤️ Most Loved"  count={lovedCount}/>
          <TabBtn id="liked" label="👍 Most Liked"  count={likedCount}/>
        </div>

        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
          {["all",...AGE_GROUPS.map(a=>a.label)].map(label=>(
            <button key={label} onClick={()=>setFilterAge(label)} style={{
              padding:"5px 13px", borderRadius:20, border:"none", cursor:"pointer", fontSize:"0.74rem",
              background: filterAge===label ? COLORS.accent1 : (nightMode?"rgba(255,255,255,0.08)":COLORS.border),
              color: filterAge===label ? "white" : (nightMode?"rgba(255,255,255,0.6)":COLORS.muted),
              fontWeight: filterAge===label ? "bold" : "normal",
              transition:"all 0.15s",
            }}>
              {label==="all" ? "✨ All Ages" : AGE_GROUPS.find(a=>a.label===label)?.emoji+" "+label}
            </button>
          ))}
        </div>

        <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
          <input type="text" placeholder="🔍 Search stories, themes..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
            style={{flex:1,minWidth:150,padding:"8px 13px",borderRadius:12,border:`2px solid ${nightMode?"rgba(255,255,255,0.15)":COLORS.border}`,background:nightMode?"rgba(255,255,255,0.07)":"white",color:nightMode?"white":COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif",outline:"none"}}/>
          <button onClick={()=>{if(filtered.length>0)setReadingStory(filtered[Math.floor(Math.random()*filtered.length)]);}}
            style={{padding:"8px 13px",borderRadius:12,cursor:"pointer",fontSize:"0.82rem",fontFamily:"Georgia,serif",border:`2px solid ${nightMode?"rgba(255,255,255,0.15)":COLORS.border}`,background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,color:"white"}}>
            🎲 Random
          </button>
        </div>

        {tab!=="all" && filtered.length>0 && (
          <div style={{marginBottom:16,padding:"10px 16px",borderRadius:14,background:tab==="loved"?"rgba(255,78,205,0.08)":"rgba(255,217,61,0.08)",border:`1px solid ${tab==="loved"?COLORS.accent5:COLORS.accent2}30`}}>
            <p style={{margin:0,fontSize:"0.84rem",color:nightMode?"rgba(255,255,255,0.7)":COLORS.text}}>
              {tab==="loved"
                ? `❤️ Showing ${filtered.length} ${filtered.length===1?"story":"stories"} sorted by most loved`
                : `👍 Showing ${filtered.length} ${filtered.length===1?"story":"stories"} sorted by most liked`}
            </p>
          </div>
        )}

        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:"52px 20px"}}>
            <div style={{fontSize:44,marginBottom:12}}>
              {library.length===0 ? "📭" : tab==="loved" ? "❤️" : tab==="liked" ? "👍" : "🔍"}
            </div>
            <h3 style={{color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted,fontWeight:"normal"}}>
              {library.length===0
                ? "No stories yet! Be the first!"
                : tab==="loved"
                  ? "No loved stories yet — go show some love!"
                  : tab==="liked"
                    ? "No liked stories yet — go give some thumbs up!"
                    : "No stories match your search."}
            </h3>
            {library.length===0 && (
              <button onClick={()=>onNavigate("create")} style={{marginTop:12,padding:"11px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.95rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>
                🎨 Create the First Story!
              </button>
            )}
            {(tab==="loved"||tab==="liked") && library.length>0 && (
              <button onClick={()=>setTab("all")} style={{marginTop:12,padding:"11px 24px",borderRadius:14,border:`2px solid ${COLORS.border}`,background:"transparent",color:nightMode?"white":COLORS.text,fontSize:"0.9rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>
                ✨ Browse All Stories
              </button>
            )}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
          {filtered.map((s,i)=>(
            <StoryCard
              key={s.id} story={s} onRead={(story)=>setReadingStory(normalizeStoryEntry(story))}
              nightMode={nightMode} votes={votes} onVote={handleVote}
              highlight={tab==="loved" && i<3}
            />
          ))}
        </div>

        <div style={{textAlign:"center",marginTop:32}}>
          <button onClick={()=>onNavigate("create")} style={{padding:"12px 24px",borderRadius:16,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.92rem",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:"0 6px 20px rgba(255,107,107,0.3)"}}>
            🎨 Add Your Story
          </button>
        </div>
      </div>
      {readingStory&&<ReadingModal story={readingStory} onClose={()=>setReadingStory(null)} nightMode={nightMode} votes={votes} onVote={handleVote}/>}
    </div>
  );
}

// ── CREATE ───────────────────────────────────────────────────────
function CreateScreen({ onNavigate, onStoryAdded, currentLibrary, selectedLanguage, onLanguageChange, setShowPaywall, onStoryGenerated, isPremium, storyCount }) {
  const [mode, setMode] = useState(null);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState("image/png");
  const [ageGroup, setAgeGroup] = useState(null);
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [storyReading, setStoryReading] = useState(false);
  const isStoppingRef = useRef(false);
  const fileRef = useRef();
  const { speak, speakLong, stop, speaking } = useSpeech({ storyLanguage: selectedLanguage });
  const spokenKeys = useRef(new Set());
  const mascotTimerRef = useRef(null);

  const getVoiceKey=(s,l,st)=>s===3&&l?"loading":s===3&&st?"story":String(s);

  useEffect(()=>{
    if(!voiceEnabled) return;
    const key=getVoiceKey(step,loading,story);
    if(spokenKeys.current.has(key)) return;
    spokenKeys.current.add(key);
    const keyMap = { '1':'welcome', '2':'age', 'loading':'loading', 'story':'story' };
    mascotTimerRef.current=setTimeout(()=>{
      mascotTimerRef.current=null;
      if(VOICE_LINES[key]) speak(VOICE_LINES[key],keyMap[key]);
    },500);
    return()=>{ if(mascotTimerRef.current) clearTimeout(mascotTimerRef.current); };
  },[step,loading,story,voiceEnabled,speak]);

  useEffect(()=>{
    const cancelScheduledMascot=()=>{
      if(mascotTimerRef.current){
        clearTimeout(mascotTimerRef.current);
        mascotTimerRef.current=null;
      }
    };
    document.addEventListener("pointerdown",cancelScheduledMascot,true);
    return()=>document.removeEventListener("pointerdown",cancelScheduledMascot,true);
  },[]);

  const replayVoice=()=>{
    const key=getVoiceKey(step,loading,story);
    const keyMap={'1':'welcome','2':'age','loading':'loading','story':'story'};
    if(VOICE_LINES[key]) speak(VOICE_LINES[key],keyMap[key]);
  };

  // Moderation now runs on the server inside /api/generate-story, so the
  // image is simply accepted here and checked when the story is made.
  const handleFile=useCallback((file)=>{
    if(!file||!file.type.startsWith("image/")) return;
    const objectUrl = URL.createObjectURL(file);
    const allowedTypes = ["image/jpeg","image/png","image/gif","image/webp"];
    const mediaType = allowedTypes.includes(file.type) ? file.type : "image/png";
    setImageMediaType(mediaType);
    const reader=new FileReader();
    reader.onload=(e)=>{
      const base64 = e.target.result.split(",")[1];
      setError(null);
      setImage(objectUrl);
      setImageBase64(base64);
      spokenKeys.current.delete("2");
      setStep(2);
    };
    reader.readAsDataURL(file);
  },[]);

  const handleCanvasUse=(dataURL,base64)=>{
    setError(null);
    setImage(dataURL);
    setImageBase64(base64);
    setImageMediaType("image/png");
    spokenKeys.current.delete("2");
    setMode(null);
    setStep(2);
  };

  const handleDrop=(e)=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);};

  const generateStory=async()=>{
    if(!imageBase64||!ageGroup) return;
    if(!isPremium&&storyCount>=10){
      setShowPaywall("limit");
      return;
    }
    setLoading(true); setError(null);
    spokenKeys.current.delete("loading"); setStep(3);
    try {
      const res=await fetch(`${process.env.REACT_APP_API_BASE_URL || ""}/api/generate-story`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          imageBase64,
          mediaType: imageMediaType,
          ageLabel: ageGroup.label,
          language: selectedLanguage,
        }),
      });
      const data=await res.json().catch(()=>({}));
      console.log("🌐 API status:", res.status, "| data:", JSON.stringify(data).slice(0,300));

      if(res.status===403&&data.error==="STORY_LIMIT_REACHED"){
        setShowPaywall("limit");
        setStep(2);
        return;
      }
      if(res.status===422){
        setError("⚠️ This picture isn't quite right for our kids' app. Please try a different drawing!");
        setStep(1);
        return;
      }
      if(res.status===503){
        setError("✨ Our picture checker is having a little nap. Please try again in a moment!");
        setStep(2);
        return;
      }
      if(res.status===413){
        setError("📸 That picture is a bit too big! Try a smaller photo.");
        setStep(1);
        return;
      }
      if(!res.ok) throw new Error(data.error||`Server error ${res.status}`);

      const parsed={ title:data.title, story:data.story, tags:data.tags||[] };
      spokenKeys.current.delete("story");
      setStory(parsed);
      prefetchStoryTTS(`${parsed.title}. ${parsed.story}`, selectedLanguage);
      onStoryGenerated?.();
    } catch(err) {
      console.error("❌ Story generation error:", err);
      setError("✨ The story magic fizzled for a second — tap \"Make My Story!\" to try again!");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleSave=async(share)=>{
    stopAllSpeech();
    setShowSaveModal(false);
    if(!share||!story) return;
    let doodleUrl = null;
    try {
      doodleUrl = await persistDoodleUrl(image, imageBase64, imageMediaType);
    } catch (err) {
      console.warn("Failed to persist doodle image:", err?.message);
    }
    if (doodleUrl?.startsWith("blob:")) {
      console.error("💾 Refusing to save blob URL as doodleUrl");
      doodleUrl = null;
    }
    console.log(
      "💾 Saving story doodleUrl:",
      doodleUrl
        ? `${doodleUrl.startsWith("data:") ? "data:" : doodleUrl.slice(0, 24)}... (${doodleUrl.length} chars)`
        : "null (no image persisted)"
    );
    const newEntry = {
      id: Date.now(),
      title: story.title,
      text: story.story,
      preview: story.story.split("\n\n")[0].slice(0,120)+"...",
      tags: story.tags||[],
      ageLabel: ageGroup.label,
      ageEmoji: ageGroup.emoji,
      ageRange: ageGroup.range,
      doodleUrl,
      likes: 0,
      loves: 0,
      date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
    };
    let updated = [newEntry, ...currentLibrary];
    console.log("💾 Saving story. Library will have", updated.length, "entries.");
    try {
      await saveLibrary(updated);
    } catch (e) {
      if (doodleUrl) {
        console.warn("Storage quota hit — retrying with smaller doodle image:", e?.message);
        try {
          const smaller = await compressDoodleDataUrl(doodleUrl, 320, 0.7);
          updated = [{ ...newEntry, doodleUrl: smaller }, ...currentLibrary];
          console.log("💾 Retrying save with compressed doodle:", `data:... (${smaller.length} chars)`);
          await saveLibrary(updated);
        } catch (retryErr) {
          console.warn("Storage quota hit — saving story without doodle image:", retryErr?.message);
          updated = [{ ...newEntry, doodleUrl: null }, ...currentLibrary];
          await saveLibrary(updated);
        }
      } else {
        throw e;
      }
    }
    onStoryAdded(updated);
    console.log("✅ onStoryAdded called with", updated.length, "entries.");
  };

  const [sharing, setSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCards, setShareCards] = useState([]);
  const [shareCardIndex, setShareCardIndex] = useState(0);

  // ── Generate multi-card 4:5 portrait carousel ────────────────
  const handleShare = async () => {
    if (!story || !ageGroup) return;
    setSharing(true);
    try {
      const W = 1080, H = 1350;

      // ── Instagram safe zone ───────────────────────────────────
      // SAFE_BOT = 200px: Instagram's like/comment bar + nav chrome
      // consumes ~180–200px at the bottom of the rendered frame.
      // Keeping all content above Y=1150 ensures the full branding
      // block is visible in feed, carousel, and Reels cover views.
      const SAFE_TOP = 80;
      const SAFE_BOT = 200;
      const ZONE_BOT = H - SAFE_BOT;   // 1150

      // Footer geometry — anchored to ZONE_BOT so branding never
      // drifts below the safe line regardless of content length.
      const BRAND_H       = 76;   // palette emoji + url line + tagline
      const GAP_NUM_BRAND = 10;   // gap between page number and brand block
      const NUM_H         = 30;   // page number text height
      const GAP_DIV_NUM   = 24;   // gap between divider line and page number
      const FOOTER_H      = BRAND_H + GAP_NUM_BRAND + NUM_H + GAP_DIV_NUM; // 140
      const footerDivY    = ZONE_BOT - FOOTER_H;  // 1010

      // ── Shared helpers ────────────────────────────────────────
      const drawBg = (ctx) => {
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#FFF4EC");
        bg.addColorStop(0.5, "#FFF9F0");
        bg.addColorStop(1, "#FFF0E8");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        const blobs = [
          [-60, -60, 240, "rgba(255,107,107,0.08)"],
          [W+60, H+60, 280, "rgba(77,150,255,0.07)"],
          [W+40, 120, 160, "rgba(255,217,61,0.09)"],
          [60, H-80, 120, "rgba(107,203,119,0.08)"],
        ];
        blobs.forEach(([x,y,r,c]) => {
          ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
          ctx.fillStyle = c; ctx.fill();
        });
      };

      const drawRounded = (ctx, x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
        ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
        ctx.closePath();
      };

      const drawFooter = (ctx, cardNum, total) => {
        // Divider line
        ctx.beginPath();
        ctx.moveTo(W/2 - 60, footerDivY);
        ctx.lineTo(W/2 + 60, footerDivY);
        ctx.strokeStyle = "rgba(255,107,107,0.35)";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Page number
        ctx.textAlign = "center";
        ctx.font = "28px Georgia, serif";
        ctx.fillStyle = "#8A8A8A";
        ctx.fillText(
          `${cardNum} / ${total}`,
          W/2,
          footerDivY + GAP_DIV_NUM + NUM_H * 0.75
        );

        // Brand block: emoji + URL on one line, tagline below
        const brandY = footerDivY + GAP_DIV_NUM + NUM_H + GAP_NUM_BRAND;
        ctx.font = "bold 38px Georgia, serif";
        ctx.fillStyle = "#FF6B6B";
        ctx.fillText("🎨 doodlestories.app", W/2, brandY + 38);

        ctx.font = "28px Georgia, serif";
        ctx.fillStyle = "#8A8A8A";
        ctx.fillText("Turn your doodle into a magical story", W/2, brandY + 38 + 42);
      };

      const wrapText = (ctx, text, maxW, fontSize, style = "") => {
        ctx.font = `${style} ${fontSize}px Georgia, serif`.trim();
        const words = text.split(" ");
        let lines = [], line = "";
        for (const word of words) {
          const test = line ? line + " " + word : word;
          if (ctx.measureText(test).width > maxW) {
            if (line) lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const canvasToUrl = (canvas) => new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("toBlob failed")); return; }
          resolve(URL.createObjectURL(blob));
        }, "image/png");
      });

      // ── Chunk story into pages ────────────────────────────────
      const paragraphs = story.story.split("\n\n").filter(p => p.trim());
      const CHARS_PER_PAGE = 480;
      const pages = [];
      let current = "";
      for (const para of paragraphs) {
        if (current && (current + " " + para).length > CHARS_PER_PAGE) {
          pages.push(current.trim());
          current = para;
        } else {
          current = current ? current + "\n\n" + para : para;
        }
      }
      if (current.trim()) pages.push(current.trim());

      const totalCards = 1 + pages.length;
      const urls = new Array(totalCards).fill(null);

      // ════════════════════════════════════════════════════════
      // CARD 0 — Cover: image + title + teaser
      // ════════════════════════════════════════════════════════
      {
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        drawBg(ctx);

        // Image block — sits just below SAFE_TOP with breathing room
        const imgPad    = 40;
        const imgW      = W - imgPad * 2;  // 1000px
        const imgY      = SAFE_TOP + 80;   // 160px from top
        const imgH      = 520;             // slightly reduced vs old 540 to give text more room
        const imgBottom = imgY + imgH;     // 680

        // White card shadow behind image
        ctx.save();
        ctx.shadowColor   = "rgba(0,0,0,0.10)";
        ctx.shadowBlur    = 28;
        ctx.shadowOffsetY = 8;
        drawRounded(ctx, imgPad, imgY, imgW, imgH, 28);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.restore();

        // Draw doodle — contain-fit, centred, no cropping
        if (image) {
          await new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              ctx.save();
              drawRounded(ctx, imgPad, imgY, imgW, imgH, 28);
              ctx.clip();
              const scale   = Math.min(imgW / img.width, imgH / img.height);
              const sw      = img.width  * scale;
              const sh      = img.height * scale;
              const xOffset = imgPad + (imgW - sw) / 2;
              const yOffset = imgY  + (imgH - sh) / 2;
              ctx.drawImage(img, xOffset, yOffset, sw, sh);
              ctx.restore();
              resolve();
            };
            img.onerror = resolve;
            img.src = image;
          });
        }

        // Age badge — top-left of image frame
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.15)";
        ctx.shadowBlur  = 8;
        ctx.fillStyle   = "rgba(255,255,255,0.95)";
        drawRounded(ctx, imgPad + 18, imgY + 18, 220, 56, 28);
        ctx.fill();
        ctx.restore();
        ctx.font      = "bold 28px Georgia, serif";
        ctx.fillStyle = "#2D2D2D";
        ctx.textAlign = "left";
        ctx.fillText(`${ageGroup.emoji} ${ageGroup.label}`, imgPad + 34, imgY + 54);

        // Text block — title + teaser, dynamically centred between image and footer
        const TITLE_FS  = 50, TITLE_LH  = 62;
        const TEASER_FS = 30, TEASER_LH = 46;
        const GAP_T_TEA = 24;
        // ty is the baseline of the first title line.
        // Visual top of title = ty - TITLE_FS, so we need ty >= imgBottom + TITLE_FS + 48
        const minGap = TITLE_FS + 48;  // 98px minimum from imgBottom to ty
        const zone   = footerDivY - imgBottom; // 330px

        ctx.textAlign = "center";
        const titleLines = wrapText(ctx, story.title, W - 120, TITLE_FS, "bold");
        const openPara   = paragraphs[0] || "";
        const teaserText = "\u201c" + openPara.slice(0, 220).trimEnd() + "\u2026\u201d";
        const tLines     = wrapText(ctx, teaserText, W - 120, TEASER_FS, "italic");

        // Space available for teaser: zone minus minGap, title, and gap between title+teaser.
        // We also leave 40px breathing room above footer divider.
        const spaceForTeaser = zone - minGap - titleLines.length * TITLE_LH - GAP_T_TEA - 40;
        const maxTeaserLines = Math.max(1, Math.floor(spaceForTeaser / TEASER_LH));
        const tShown         = Math.min(tLines.length, maxTeaserLines);

        const textH    = Math.min(
          titleLines.length * TITLE_LH + GAP_T_TEA + tShown * TEASER_LH,
          zone - minGap - 40   // hard ceiling: never overflow footer
        );
        const gapAbove = Math.max(minGap, Math.round((zone - textH) / 2));
        let ty         = imgBottom + gapAbove;

        // Title
        ctx.font      = `bold ${TITLE_FS}px Georgia, serif`;
        ctx.fillStyle = "#2D2D2D";
        titleLines.forEach((line, i) => ctx.fillText(line, W/2, ty + i * TITLE_LH));
        ty += titleLines.length * TITLE_LH + GAP_T_TEA;

        // Teaser
        ctx.font      = `italic ${TEASER_FS}px Georgia, serif`;
        ctx.fillStyle = "#7A7A7A";
        tLines.slice(0, tShown).forEach((line, i) => ctx.fillText(line, W/2, ty + i * TEASER_LH));

        drawFooter(ctx, 1, totalCards);
        urls[0] = await canvasToUrl(canvas);
      }

      // ════════════════════════════════════════════════════════
      // CARDS 1..N — Story pages
      // ════════════════════════════════════════════════════════
      for (let pi = 0; pi < pages.length; pi++) {
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        drawBg(ctx);

        const STORY_FS  = 38;
        const STORY_LH  = 56;
        const PARA_GAP  = 40;
        const BODY_FONT = `${STORY_FS}px Georgia, serif`;
        const MAX_W     = W - 160;  // 920px text width, 80px margin each side
        const CX        = W / 2;

        const pageParas = pages[pi].split("\n\n");

        // Pre-compute wrapped lines for every paragraph on this page
        const paraLines = pageParas.map((para, pp) => {
          ctx.font = BODY_FONT;
          const lines   = wrapText(ctx, para, MAX_W, STORY_FS);
          const isFirst = (pi === 0 && pp === 0);
          return { lines, isFirst };
        });

        // Total height of the text block
        let totalTextH = 0;
        paraLines.forEach((p, pp) => {
          totalTextH += p.lines.length * STORY_LH;
          if (pp < paraLines.length - 1) totalTextH += PARA_GAP;
        });

        // Vertically centre within the content zone.
        // Visual span of text block (cap-height top to baseline of last line):
        //   visualSpan = totalTextH - STORY_LH + STORY_FS
        // curY is the render origin; first baseline lands at curY + BASELINE (STORY_FS*0.80).
        // We solve: curY + BASELINE + visualSpan/2 - STORY_FS = zoneMid
        const BASELINE    = STORY_FS * 0.80;
        const visualSpan  = totalTextH - STORY_LH + STORY_FS;
        const contentTop  = SAFE_TOP + 20;
        const contentBot  = footerDivY - 40;
        const zoneMid     = (contentTop + contentBot) / 2;
        const idealCurY   = Math.round(zoneMid - BASELINE - visualSpan / 2 + STORY_FS);
        const minY        = contentTop;
        const maxY        = contentBot - totalTextH;
        let curY          = Math.min(maxY, Math.max(minY, idealCurY));

        // Render paragraphs — centred layout with inline drop cap on first line
        ctx.textAlign = "center";
        paraLines.forEach((p, pp) => {
          p.lines.forEach((line, i) => {
            const y = curY + i * STORY_LH + STORY_FS * 0.80;
            if (p.isFirst && i === 0) {
              // Inline large coloured first letter
              const firstChar = line.charAt(0);
              const rest      = line.slice(1);
              const DROP_FS   = 56;
              ctx.font = `bold ${DROP_FS}px Georgia, serif`;
              const charW = ctx.measureText(firstChar).width;
              ctx.font    = BODY_FONT;
              const restW = ctx.measureText(rest).width;
              const lineStartX = CX - (charW + restW) / 2;
              // Big coloured first letter
              ctx.font      = `bold ${DROP_FS}px Georgia, serif`;
              ctx.fillStyle = "#FF6B6B";
              ctx.textAlign = "left";
              ctx.fillText(firstChar, lineStartX, y + (DROP_FS - STORY_FS) * 0.1);
              // Remainder of first line
              ctx.font      = BODY_FONT;
              ctx.fillStyle = "#2D2D2D";
              ctx.fillText(rest, lineStartX + charW, y);
              ctx.textAlign = "center";
            } else {
              ctx.font      = BODY_FONT;
              ctx.fillStyle = "#2D2D2D";
              ctx.fillText(line, CX, y);
            }
          });
          curY += p.lines.length * STORY_LH;
          if (pp < paraLines.length - 1) curY += PARA_GAP;
        });

        drawFooter(ctx, pi + 2, totalCards);
        urls[pi + 1] = await canvasToUrl(canvas);
      }

      const finalUrls = urls.filter(Boolean);
      setShareCards(finalUrls);
      setShareCardIndex(0);
      setSharing(false);
      setShowShareModal(true);

    } catch (err) {
      console.error("Share failed:", err);
      setSharing(false);
    }
  };

  const downloadAllCards = async () => {
    for (let i = 0; i < shareCards.length; i++) {
      const a = document.createElement("a");
      a.href = shareCards[i];
      a.download = `card-${String(i + 1).padStart(2, "0")}-of-${shareCards.length}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (i < shareCards.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  const reset=()=>{
    stop();
    setStoryReading(false);
    setImage(null); setImageBase64(null); setImageMediaType("image/png"); setAgeGroup(null);
    setStory(null); setError(null); setMode(null);
    spokenKeys.current.clear(); setStep(1);
  };

  const handleStartReading=async()=>{
    if(isStoppingRef.current) return;
    setStoryReading(true);
    try{
      await speakLong(`${story.title}. ${story.story}`);
    }finally{
      if(!isStoppingRef.current) setStoryReading(false);
    }
  };

  const handleStoryReadAloud=()=>{
    if(storyReading){
      isStoppingRef.current=true;
      stop();
      setStoryReading(false);
      setTimeout(()=>{ isStoppingRef.current=false; },500);
      return;
    }
    if(isStoppingRef.current) return;
    handleStartReading();
  };

  const VoiceBubble=({text})=>(
    <div style={{display:"flex",alignItems:"flex-start",gap:10,background:"linear-gradient(135deg,#FFF8E1,#FFFDF5)",border:`2px solid ${COLORS.accent2}`,borderRadius:18,padding:"11px 13px",marginBottom:18,boxShadow:"0 4px 16px rgba(255,217,61,0.18)"}}>
      <div style={{fontSize:24,flexShrink:0,animation:speaking?"mascotBounce 0.5s infinite alternate":"none"}}>🌟</div>
      <p style={{margin:0,flex:1,color:COLORS.text,fontSize:"0.86rem",lineHeight:1.5,fontStyle:"italic"}}>{text}</p>
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        <button onClick={replayVoice} style={{width:28,height:28,borderRadius:"50%",border:"none",background:speaking?COLORS.accent1:COLORS.accent2,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>{speaking?"⏹":"🔊"}</button>
        <button onClick={()=>{stop();setVoiceEnabled(v=>!v);}} style={{width:28,height:28,borderRadius:"50%",border:`2px solid ${COLORS.border}`,background:voiceEnabled?"white":"#eee",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>{voiceEnabled?"🔈":"🔇"}</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif",position:"relative",overflow:"hidden"}}>
      <div style={{position:"fixed",top:-80,right:-80,width:300,height:300,borderRadius:"50%",background:"rgba(255,107,107,0.12)",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,maxWidth:700,margin:"0 auto",padding:"30px 20px 60px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <button onClick={()=>mode?setMode(null):onNavigate("home")} style={{background:"none",border:`2px solid ${COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← {mode?"Cancel":"Home"}</button>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} />
            <button onClick={()=>onNavigate("library")} style={{background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,border:"none",borderRadius:12,padding:"7px 13px",cursor:"pointer",color:"white",fontSize:"0.8rem",fontFamily:"Georgia,serif"}}>🌙 Library</button>
          </div>
        </div>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:40,marginBottom:4}}>🎨</div>
          <h1 style={{fontSize:"clamp(1.5rem,5vw,2.2rem)",color:COLORS.text,margin:0,letterSpacing:"-0.02em"}}>Doodle <span style={{color:COLORS.accent1}}>Stories</span></h1>
        </div>
        {!mode&&(
          <div style={{display:"flex",justifyContent:"center",gap:7,marginBottom:22}}>
            {["Doodle","Age","Story"].map((label,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:25,height:25,borderRadius:"50%",background:step>i+1?COLORS.accent3:step===i+1?COLORS.accent1:COLORS.border,color:step>=i+1?"white":COLORS.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem",fontWeight:"bold",transition:"all 0.3s",boxShadow:step===i+1?`0 4px 12px rgba(255,107,107,0.4)`:"none"}}>
                  {step>i+1?"✓":i+1}
                </div>
                <span style={{fontSize:"0.75rem",color:step===i+1?COLORS.text:COLORS.muted,fontWeight:step===i+1?"bold":"normal"}}>{label}</span>
                {i<2&&<div style={{width:14,height:2,background:step>i+1?COLORS.accent3:COLORS.border,borderRadius:1}}/>}
              </div>
            ))}
          </div>
        )}

        {step===1&&!mode&&(
          <div>
            <VoiceBubble text={VOICE_LINES[1]}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current.click()}
                style={{border:`3px dashed ${dragOver?COLORS.accent1:COLORS.border}`,borderRadius:22,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(255,107,107,0.04)":COLORS.card,transition:"all 0.2s",boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
                <div style={{fontSize:44,marginBottom:10}}>📸</div>
                <h3 style={{color:COLORS.text,fontSize:"1rem",margin:"0 0 5px",fontWeight:"bold"}}>Upload Drawing</h3>
                <p style={{color:COLORS.muted,margin:0,fontSize:"0.78rem",lineHeight:1.4}}>Tap to upload a photo of your drawing</p>
              </div>
              <div onClick={()=>setMode("draw")}
                style={{border:`3px solid ${COLORS.border}`,borderRadius:22,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:COLORS.card,transition:"all 0.2s",boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=COLORS.accent3;e.currentTarget.style.background="rgba(107,203,119,0.04)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.background=COLORS.card;}}>
                <div style={{fontSize:44,marginBottom:10}}>✏️</div>
                <h3 style={{color:COLORS.text,fontSize:"1rem",margin:"0 0 5px",fontWeight:"bold"}}>Draw Here!</h3>
                <p style={{color:COLORS.muted,margin:0,fontSize:"0.78rem",lineHeight:1.4}}>Create your doodle right in the app</p>
              </div>
            </div>
            {error&&<p style={{textAlign:"center",color:COLORS.accent1,fontSize:"0.86rem",marginBottom:12,padding:"10px",background:"rgba(255,107,107,0.06)",borderRadius:10}}>{error}</p>}
            <p style={{textAlign:"center",color:"#ccc",fontSize:"0.74rem",margin:0}}>Any drawing turns into a magical story ✨</p>
          </div>
        )}

        {step===1&&mode==="draw"&&(
          <DoodlePad onUse={handleCanvasUse} onCancel={()=>setMode(null)}/>
        )}

        {step===2&&(
          <div>
            <VoiceBubble text={VOICE_LINES[2]}/>
            {image&&<div style={{textAlign:"center",marginBottom:18}}>
              <img src={image} alt="Doodle" style={{maxWidth:"100%",maxHeight:170,borderRadius:14,boxShadow:"0 12px 40px rgba(0,0,0,0.12)",border:"4px solid white"}}/>
              <p style={{color:COLORS.muted,fontSize:"0.8rem",marginTop:6,fontStyle:"italic"}}>What an AMAZING drawing! 🌟</p>
            </div>}
            <h2 style={{textAlign:"center",color:COLORS.text,fontSize:"1rem",fontWeight:"normal",marginBottom:12}}>How old is the little artist? 👇</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:14}}>
              {AGE_GROUPS.map(group=>(
                <button key={group.range} onClick={()=>{ setAgeGroup(group); setTimeout(()=>speak(VOICE_LINES.ageSelected,'ageSelected'),300); }}
                  style={{padding:"13px 10px",borderRadius:14,border:`3px solid ${ageGroup?.range===group.range?COLORS.accent1:COLORS.border}`,background:ageGroup?.range===group.range?"rgba(255,107,107,0.06)":COLORS.card,cursor:"pointer",transition:"all 0.2s",boxShadow:ageGroup?.range===group.range?`0 6px 20px rgba(255,107,107,0.2)`:"0 4px 12px rgba(0,0,0,0.04)",transform:ageGroup?.range===group.range?"scale(1.03)":"scale(1)"}}>
                  <div style={{fontSize:24,marginBottom:3}}>{group.emoji}</div>
                  <div style={{fontWeight:"bold",color:COLORS.text,fontSize:"0.85rem"}}>{group.label}</div>
                  <div style={{color:COLORS.muted,fontSize:"0.72rem",marginTop:1}}>Ages {group.range}</div>
                </button>
              ))}
            </div>
            <div style={{marginBottom:14}}>
              <label htmlFor="story-language" style={{display:"block",textAlign:"center",fontSize:"0.92rem",color:COLORS.text,fontWeight:"bold",marginBottom:8}}>
                🌍 What language should the story be in?
              </label>
              <select
                id="story-language"
                value={selectedLanguage}
                onChange={(e)=>onLanguageChange(e.target.value)}
                aria-label="Story language"
                style={{width:"100%",padding:"11px 14px",borderRadius:13,border:`2px solid ${COLORS.border}`,background:"white",color:COLORS.text,fontSize:"0.9rem",fontFamily:"Georgia,serif",cursor:"pointer",boxSizing:"border-box"}}
              >
                {TTS_LANGUAGES.map((lang)=>(
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={reset} style={{flex:1,padding:"11px",borderRadius:13,border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",color:COLORS.muted,fontSize:"0.86rem"}}>← New Doodle</button>
              <button onClick={generateStory} disabled={!ageGroup}
                style={{flex:2,padding:"11px",borderRadius:13,border:"none",background:ageGroup?`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`:COLORS.border,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:ageGroup?"pointer":"not-allowed",boxShadow:ageGroup?"0 6px 20px rgba(255,107,107,0.35)":"none",fontFamily:"Georgia,serif"}}>
                ✨ Make My Story!
              </button>
            </div>
            {error&&<p style={{textAlign:"center",color:COLORS.accent1,fontSize:"0.86rem",marginTop:12,padding:"10px",background:"rgba(255,107,107,0.06)",borderRadius:10}}>{error}</p>}
          </div>
        )}

        {step===3&&(
          <div>
            {loading&&(
              <div>
                <VoiceBubble text={VOICE_LINES.loading}/>
                <div style={{textAlign:"center",padding:"38px 20px"}}>
                  <div style={{fontSize:50,marginBottom:13,animation:"spin 2s linear infinite",display:"inline-block"}}>✨</div>
                  <h2 style={{color:COLORS.text,fontWeight:"normal",fontSize:"1.1rem",marginBottom:5}}>The story magic is happening...</h2>
                  <p style={{color:COLORS.muted,fontStyle:"italic",marginBottom:16}}>Your drawing is becoming a story!</p>
                  <div style={{display:"flex",justifyContent:"center",gap:7}}>
                    {[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:[COLORS.accent1,COLORS.accent2,COLORS.accent3][i],animation:`dot 1s ${i*0.25}s infinite`}}/>)}
                  </div>
                </div>
              </div>
            )}
            {error&&(
              <div style={{textAlign:"center",padding:28}}>
                <div style={{fontSize:38}}>😬</div>
                <p style={{color:COLORS.accent1,fontSize:"0.95rem",lineHeight:1.6,margin:"12px 0 20px"}}>{error}</p>
                <button onClick={()=>setStep(2)} style={{padding:"9px 22px",borderRadius:12,border:"none",background:COLORS.accent1,color:"white",cursor:"pointer",fontSize:"0.9rem",fontFamily:"Georgia,serif"}}>Try Again</button>
              </div>
            )}
            {story&&!loading&&(
              <div>
                <VoiceBubble text={VOICE_LINES.story}/>
                <div style={{display:"flex",gap:13,marginBottom:16,alignItems:"flex-start"}}>
                  {image&&<img src={image} alt="doodle" style={{width:76,height:76,objectFit:"cover",borderRadius:11,boxShadow:"0 6px 20px rgba(0,0,0,0.1)",border:"3px solid white",flexShrink:0}}/>}
                  <div>
                    <div style={{fontSize:"0.65rem",color:COLORS.accent3,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:2}}>✦ Your Story</div>
                    <h2 style={{margin:0,fontSize:"clamp(0.95rem,3vw,1.35rem)",color:COLORS.text,lineHeight:1.2}}>{story.title}</h2>
                    <div style={{marginTop:3,fontSize:"0.72rem",color:COLORS.muted}}>{ageGroup?.emoji} {ageGroup?.label} · Ages {ageGroup?.range}</div>
                    {story.tags&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>{story.tags.map(tag=><span key={tag} style={{padding:"2px 8px",borderRadius:20,background:"rgba(77,150,255,0.1)",color:COLORS.accent4,fontSize:"0.65rem",fontWeight:"bold"}}>#{tag}</span>)}</div>}
                  </div>
                </div>
                <div style={{background:COLORS.card,borderRadius:18,padding:"20px 24px",boxShadow:"0 8px 32px rgba(0,0,0,0.07)",border:`1px solid ${COLORS.border}`,marginBottom:14}}>
                  {story.story.split("\n\n").map((para,i)=>(
                    <p key={i} style={{lineHeight:1.85,color:COLORS.text,fontSize:"0.96rem",margin:"0 0 11px"}}>
                      {i===0&&<span style={{fontSize:"2rem",float:"left",lineHeight:0.8,marginRight:5,color:COLORS.accent1,fontWeight:"bold"}}>{para.charAt(0)}</span>}
                      {i===0?para.slice(1):para}
                    </p>
                  ))}
                </div>
                <button onClick={handleStoryReadAloud}
                  style={{width:"100%",padding:"12px",borderRadius:14,border:"none",marginBottom:9,background:storyReading?`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:"pointer",boxShadow:storyReading?"0 6px 20px rgba(255,107,107,0.35)":"0 6px 20px rgba(77,150,255,0.3)",fontFamily:"Georgia,serif",transition:"all 0.2s"}}>
                  {storyReading?"⏹ Stop Reading":"🔊 Read This Story Aloud"}
                </button>
                <button onClick={handleShare} disabled={sharing}
                  style={{width:"100%",padding:"12px",borderRadius:14,border:"none",marginBottom:9,background:sharing?"#ccc":`linear-gradient(135deg,${COLORS.accent3},#3BB54A)`,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:sharing?"not-allowed":"pointer",boxShadow:sharing?"none":"0 6px 20px rgba(107,203,119,0.35)",fontFamily:"Georgia,serif",transition:"all 0.2s"}}>
                  {sharing?"✨ Creating card...":"📲 Share This Story"}
                </button>
                <button onClick={()=>setShowSaveModal(true)}
                  style={{width:"100%",padding:"12px",borderRadius:14,border:"none",marginBottom:9,background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 6px 20px rgba(45,27,110,0.3)",fontFamily:"Georgia,serif"}}>
                  🌙 Save to Bedtime Library
                </button>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={reset} style={{flex:1,padding:"10px",borderRadius:12,border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>🎨 New Doodle</button>
                  <button onClick={()=>{setStory(null);spokenKeys.current.delete("loading");spokenKeys.current.delete("story");generateStory();}}
                    style={{flex:1,padding:"10px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`,color:"white",fontSize:"0.86rem",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:"0 6px 20px rgba(77,150,255,0.3)"}}>
                    ✨ New Story
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showSaveModal&&story&&<SaveModal story={story} onSave={handleSave}/>}

      {/* ── Social Share Modal ── */}
      {showShareModal&&shareCards.length>0&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={()=>setShowShareModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:24,width:"100%",maxWidth:440,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.35)",display:"flex",flexDirection:"column"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 0",flexShrink:0}}>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setShowShareModal(false);onNavigate("home");}} style={{padding:"7px 13px",borderRadius:10,border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",color:COLORS.text,fontSize:"0.78rem",fontFamily:"Georgia,serif",fontWeight:"bold"}}>🏠 Home</button>
                <button onClick={()=>{setShowShareModal(false);reset();}} style={{padding:"7px 13px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,cursor:"pointer",color:"white",fontSize:"0.78rem",fontFamily:"Georgia,serif",fontWeight:"bold"}}>🎨 New Doodle</button>
              </div>
              <button onClick={()=>setShowShareModal(false)} style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:COLORS.muted}}>✕</button>
            </div>

            {/* Card preview */}
            <div style={{padding:"12px 16px 0",flexShrink:0}}>
              <div style={{position:"relative",background:"#FFF9F0",borderRadius:14,overflow:"hidden"}}>
                <img
                  src={shareCards[shareCardIndex]}
                  alt={`Story card ${shareCardIndex + 1} of ${shareCards.length}`}
                  style={{width:"100%",maxHeight:260,objectFit:"contain",display:"block",borderRadius:14}}
                />
                {shareCards.length>1&&shareCardIndex>0&&(
                  <button onClick={()=>setShareCardIndex(i=>i-1)} style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",width:36,height:36,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.55)",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>‹</button>
                )}
                {shareCards.length>1&&shareCardIndex<shareCards.length-1&&(
                  <button onClick={()=>setShareCardIndex(i=>i+1)} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",width:36,height:36,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.55)",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>›</button>
                )}
                {shareCards.length>1&&(
                  <div style={{position:"absolute",bottom:7,left:0,right:0,display:"flex",justifyContent:"center",gap:5}}>
                    {shareCards.map((_,i)=>(
                      <button key={i} onClick={()=>setShareCardIndex(i)} style={{width:i===shareCardIndex?18:7,height:7,borderRadius:4,border:"none",background:i===shareCardIndex?COLORS.accent1:"rgba(255,255,255,0.7)",cursor:"pointer",padding:0,transition:"all 0.2s"}}/>
                    ))}
                  </div>
                )}
              </div>
              <p style={{textAlign:"center",margin:"6px 0 0",color:COLORS.muted,fontSize:"0.72rem",fontFamily:"Georgia,serif"}}>
                Card {shareCardIndex+1} of {shareCards.length} · tap dots or arrows to preview
              </p>
            </div>

            {/* Actions */}
            <div style={{padding:"12px 16px 18px",display:"flex",flexDirection:"column",gap:8}}>

              {/* Download all cards */}
              <button
                onClick={downloadAllCards}
                style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.9rem",fontWeight:"bold",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:"0 5px 16px rgba(255,107,107,0.3)"}}>
                📦 Download Cards
              </button>

              {/* Save single card */}
              <button
                onClick={()=>{
                  const a=document.createElement("a");
                  a.href=shareCards[shareCardIndex];
                  a.download=`doodle-story-card-${shareCardIndex+1}.png`;
                  a.click();
                }}
                style={{width:"100%",padding:"10px",borderRadius:13,border:`2px solid ${COLORS.border}`,background:"transparent",color:COLORS.muted,fontSize:"0.82rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>
                ⬇️ Save just card {shareCardIndex+1}
              </button>

              {/* Instagram instructions */}
              <div style={{background:"rgba(77,150,255,0.07)",borderRadius:11,padding:"10px 13px",textAlign:"left"}}>
                <p style={{margin:0,fontSize:"0.74rem",color:COLORS.text,fontFamily:"Georgia,serif",lineHeight:1.65}}>
                  <strong>📱 How to post on Instagram:</strong><br/>
                  1. Tap Download Cards — they save one by one<br/>
                  2. Instagram → + → Post → tap <strong>multi-image icon</strong><br/>
                  3. Tap <strong>card-01 first</strong>, then 02, 03... in order<br/>
                  4. Share as carousel ✨
                </p>
              </div>

              {/* Social platform links */}
              <p style={{textAlign:"center",margin:"2px 0 0",color:COLORS.muted,fontSize:"0.74rem",fontFamily:"Georgia,serif"}}>Open your platform to post:</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {[
                  {label:"Instagram",emoji:"📸",color:"#E1306C",bg:"rgba(225,48,108,0.08)",url:"https://www.instagram.com/"},
                  {label:"TikTok",emoji:"🎵",color:"#010101",bg:"rgba(0,0,0,0.06)",url:"https://www.tiktok.com/upload"},
                  {label:"Facebook",emoji:"📘",color:"#1877F2",bg:"rgba(24,119,242,0.08)",url:"https://www.facebook.com/"},
                  {label:"YouTube",emoji:"▶️",color:"#FF0000",bg:"rgba(255,0,0,0.07)",url:"https://studio.youtube.com/"},
                ].map(p=>(
                  <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer"
                    style={{display:"flex",alignItems:"center",gap:7,padding:"9px 12px",borderRadius:11,border:`2px solid ${p.color}30`,background:p.bg,textDecoration:"none"}}>
                    <span style={{fontSize:16}}>{p.emoji}</span>
                    <span style={{fontFamily:"Georgia,serif",fontWeight:"bold",fontSize:"0.82rem",color:p.color}}>{p.label}</span>
                  </a>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ABOUT ────────────────────────────────────────────────────────
function AboutScreen({ onNavigate, isPremium, setShowPaywall }) {
  const SOCIALS = [
    { icon:"🎵", label:"TikTok",    url:"https://tiktok.com/@doodlestoriesapp" },
    { icon:"📸", label:"Instagram", url:"https://instagram.com/doodlestoriesapp" },
    { icon:"▶️", label:"YouTube",   url:"https://youtube.com/@DoodleStoriesapp" },
    { icon:"📘", label:"Facebook",  url:"https://facebook.com/doodlestoriesapp" },
  ];
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:680,margin:"0 auto",padding:"30px 24px 60px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
          <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} />
        </div>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:60,marginBottom:12}}>🎨</div>
          <h1 style={{fontSize:"clamp(1.8rem,5vw,2.5rem)",color:COLORS.text,margin:"0 0 10px",letterSpacing:"-0.02em"}}>About <span style={{color:COLORS.accent1}}>Doodle Stories</span></h1>
          <p style={{color:COLORS.muted,fontSize:"1rem",fontStyle:"italic",lineHeight:1.6,margin:0}}>Where every drawing becomes a story worth telling</p>
        </div>
        <div style={{background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,borderRadius:24,padding:"28px 32px",marginBottom:24,color:"white"}}>
          <div style={{fontSize:"0.7rem",letterSpacing:"0.12em",textTransform:"uppercase",color:COLORS.accent2,fontWeight:"bold",marginBottom:10}}>✦ Our Mission</div>
          <p style={{fontSize:"1.1rem",lineHeight:1.8,margin:0,fontStyle:"italic"}}>"To turn every child's drawing into a story worth telling — and a story worth sharing."</p>
        </div>
        <div style={{background:"white",borderRadius:20,padding:"24px 28px",marginBottom:20,border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
          <h2 style={{color:COLORS.text,fontSize:"1.1rem",margin:"0 0 14px"}}>Our Story 🌟</h2>
          <p style={{color:COLORS.text,lineHeight:1.85,fontSize:"0.95rem",margin:"0 0 12px"}}>Doodle Stories was born from a simple belief — that every child's imagination deserves to be celebrated. Kids draw extraordinary things: dragons made of spaghetti, houses that float on clouds, cats who run bakeries. But too often those drawings stay folded in a backpack or stuck to a fridge.</p>
          <p style={{color:COLORS.text,lineHeight:1.85,fontSize:"0.95rem",margin:0}}>We built Doodle Stories to change that. Upload or draw a doodle, pick an age group, and watch as AI transforms that drawing into a personalized story — narrated, shareable, and saved right on your device so you can revisit it any night you like.</p>
        </div>
        <div style={{background:"white",borderRadius:20,padding:"24px 28px",marginBottom:20,border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
          <h2 style={{color:COLORS.text,fontSize:"1.1rem",margin:"0 0 16px"}}>What We Believe 💛</h2>
          {[
            ["🎨","Every child is a storyteller","Their imagination just needs a little magic to come alive."],
            ["🌍","Stories connect us","A child's drawing in Houston can inspire a bedtime story in London."],
            ["🔒","Kids deserve safe spaces","DoodleStories offers that space — no accounts required, no ads, just creativity and loads of wonderful stories."],
            ["✨","Creativity is a superpower","We celebrate every doodle — wobbly lines and all."],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{display:"flex",gap:14,marginBottom:16,alignItems:"flex-start"}}>
              <div style={{fontSize:26,flexShrink:0,marginTop:2}}>{icon}</div>
              <div>
                <div style={{fontWeight:"bold",color:COLORS.text,fontSize:"0.92rem",marginBottom:3}}>{title}</div>
                <div style={{color:COLORS.muted,fontSize:"0.84rem",lineHeight:1.6}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{background:"white",borderRadius:20,padding:"24px 28px",marginBottom:24,border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
          <h2 style={{color:COLORS.text,fontSize:"1.1rem",margin:"0 0 12px"}}>Follow Our Journey 🚀</h2>
          <p style={{color:COLORS.muted,fontSize:"0.88rem",lineHeight:1.6,margin:"0 0 16px"}}>We share kids' stories, new features, and behind-the-scenes moments on social media. Come say hi!</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {SOCIALS.map(s=>(
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:14,border:`2px solid ${COLORS.border}`,textDecoration:"none",color:COLORS.text,background:"#FAFAFA",fontSize:"0.9rem",fontFamily:"Georgia,serif",transition:"all 0.2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=COLORS.accent1;e.currentTarget.style.background="rgba(255,107,107,0.04)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.background="#FAFAFA";}}>
                <span style={{fontSize:22}}>{s.icon}</span>
                <span style={{fontWeight:"bold"}}>{s.label}</span>
              </a>
            ))}
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <button onClick={()=>onNavigate("create")} style={{padding:"14px 32px",borderRadius:18,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"1rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 8px 28px rgba(255,107,107,0.35)",fontFamily:"Georgia,serif"}}>🎨 Create Your Story</button>
        </div>
      </div>
    </div>
  );
}

// ── CONTACT ───────────────────────────────────────────────────────
function ContactScreen({ onNavigate, isPremium, setShowPaywall }) {
  const [form,setForm]=useState({name:"",email:"",reason:"",message:""});
  const [submitted,setSubmitted]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState(null);
  const REASONS=["General enquiry","School or classroom inquiry","Bug report","Press or media","Partnership opportunity","Feature request"];
  const SOCIALS=[
    {icon:"🎵",label:"TikTok",url:"https://tiktok.com/@doodlestoriesapp"},
    {icon:"📸",label:"Instagram",url:"https://instagram.com/doodlestoriesapp"},
    {icon:"▶️",label:"YouTube",url:"https://youtube.com/@DoodleStoriesapp"},
    {icon:"📘",label:"Facebook",url:"https://facebook.com/doodlestoriesapp"},
  ];
  const handleSubmit=async()=>{
    if(!form.name||!form.email||!form.reason||!form.message){setError("Please fill in all fields before sending.");return;}
    setSending(true);setError(null);
    try {
      await fetch("https://formsubmit.co/ajax/doodlestoriesapp@gmail.com",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({name:form.name,email:form.email,reason:form.reason,message:form.message,_subject:`DoodleStories Contact: ${form.reason}`})});
      setSubmitted(true);
    } catch { setError("Something went wrong. Please email us directly at doodlestoriesapp@gmail.com"); }
    setSending(false);
  };
  const inputStyle={width:"100%",padding:"12px 14px",borderRadius:12,border:`2px solid ${COLORS.border}`,fontSize:"0.92rem",fontFamily:"Georgia,serif",color:COLORS.text,background:"white",outline:"none",boxSizing:"border-box",marginTop:6};
  const labelStyle={fontSize:"0.82rem",fontWeight:"bold",color:COLORS.text,display:"block"};
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:620,margin:"0 auto",padding:"30px 24px 60px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
          <GoPremiumButton isPremium={isPremium} setShowPaywall={setShowPaywall} />
        </div>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:52,marginBottom:10}}>💌</div>
          <h1 style={{fontSize:"clamp(1.8rem,5vw,2.5rem)",color:COLORS.text,margin:"0 0 10px",letterSpacing:"-0.02em"}}>Get in <span style={{color:COLORS.accent1}}>Touch</span></h1>
          <p style={{color:COLORS.muted,fontSize:"0.95rem",lineHeight:1.6,margin:0}}>We'd love to hear from you — whether you're a parent, teacher, or just curious!</p>
        </div>
        {submitted?(
          <div style={{background:"white",borderRadius:24,padding:"40px 32px",textAlign:"center",border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:56,marginBottom:16}}>🎉</div>
            <h2 style={{color:COLORS.text,margin:"0 0 12px"}}>Message sent!</h2>
            <p style={{color:COLORS.muted,lineHeight:1.7,margin:"0 0 24px"}}>Thank you for reaching out! The DoodleStories team will get back to you within 1–2 business days.</p>
            <button onClick={()=>onNavigate("home")} style={{padding:"12px 28px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.95rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>Back to Home</button>
          </div>
        ):(
          <div>
            <div style={{background:"white",borderRadius:24,padding:"28px 32px",border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)",marginBottom:20}}>
              <div style={{marginBottom:16}}>
                <label style={labelStyle}>Your Name</label>
                <input style={inputStyle} placeholder="e.g. Sarah Johnson" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={labelStyle}>Email Address</label>
                <input style={inputStyle} type="email" placeholder="e.g. sarah@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={labelStyle}>Reason for Contact</label>
                <select style={{...inputStyle,cursor:"pointer"}} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}>
                  <option value="">Select a reason...</option>
                  {REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{marginBottom:20}}>
                <label style={labelStyle}>Message</label>
                <textarea style={{...inputStyle,minHeight:120,resize:"vertical"}} placeholder="Tell us what's on your mind..." value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}/>
              </div>
              {error&&<p style={{color:COLORS.accent1,fontSize:"0.84rem",margin:"0 0 14px"}}>{error}</p>}
              <button onClick={handleSubmit} disabled={sending}
                style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:sending?COLORS.border:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"1rem",fontWeight:"bold",cursor:sending?"not-allowed":"pointer",boxShadow:sending?"none":"0 6px 20px rgba(255,107,107,0.35)",fontFamily:"Georgia,serif"}}>
                {sending?"Sending...":"✉️ Send Message"}
              </button>
              <p style={{textAlign:"center",color:COLORS.muted,fontSize:"0.78rem",margin:"14px 0 0"}}>Or email us directly at <strong>doodlestoriesapp@gmail.com</strong></p>
            </div>
            <div style={{background:"white",borderRadius:20,padding:"20px 28px",border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
              <p style={{color:COLORS.text,fontSize:"0.88rem",fontWeight:"bold",margin:"0 0 12px"}}>Follow us on social media</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {SOCIALS.map(s=>(
                  <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:12,border:`2px solid ${COLORS.border}`,textDecoration:"none",color:COLORS.text,background:"#FAFAFA",fontSize:"0.86rem",fontFamily:"Georgia,serif",transition:"all 0.2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=COLORS.accent1;e.currentTarget.style.background="rgba(255,107,107,0.04)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.background="#FAFAFA";}}>
                    <span style={{fontSize:18}}>{s.icon}</span>
                    <span>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ROOT ─────────────────────────────────────────────────────────
function TtsErrorToast({ visible }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(45, 27, 110, 0.92)",
        color: "white",
        padding: "10px 18px",
        borderRadius: 14,
        fontSize: "0.86rem",
        fontFamily: "Georgia, serif",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        pointerEvents: "none",
      }}
    >
      🔇 Audio unavailable right now
    </div>
  );
}

function getInitialView() {
  if (typeof window === "undefined") return "home";
  const path = window.location.pathname;
  if (path === "/success") return "success";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return "home";
}

export default function App() {
  const [view, setView] = useState(getInitialView);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [library, setLibrary] = useState([]);
  const [votes, setVotes] = useState({});
  const [showPaywall, setShowPaywall] = useState(false);
  const [storyCount, setStoryCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const { speak } = useSpeech();
  const ttsError = useTtsErrorBanner();

  useEffect(()=>{
    Promise.all([loadLibrary(), loadVotes()]).then(([lib, v])=>{
      setLibrary(lib);
      setVotes(v);
    });
  },[]);

  useEffect(()=>{
    fetch(`${process.env.REACT_APP_API_BASE_URL || ""}/api/check-story-limit`)
      .then((res)=>res.json())
      .then((data)=>{
        setStoryCount(data.count ?? 0);
        setIsPremium(!!data.isPremium);
      })
      .catch(()=>{});
  },[]);

  const onStoryGenerated = () => {
    setStoryCount((prev) => {
      const next = Math.min(prev + 1, 10);
      if (next >= 10) setShowPaywall("limit");
      return next;
    });
    fetch(`${process.env.REACT_APP_API_BASE_URL || ""}/api/check-story-limit`)
      .then((res)=>res.json())
      .then((data)=>{
        setStoryCount(data.count ?? 0);
        setIsPremium(!!data.isPremium);
      })
      .catch(()=>{});
  };

  const handleVote = async (id, type) => {
    if (votes[id]) return;
    const newVotes = { ...votes, [id]: type };
    setVotes(newVotes);
    await saveVotes(newVotes);
    const updated = library.map(s =>
      s.id===id
        ? { ...s, [type==="love"?"loves":"likes"]: (s[type==="love"?"loves":"likes"]||0)+1 }
        : s
    );
    setLibrary(updated);
    await saveLibrary(updated);
  };

  const navigate = (next) => {
    const paths = { privacy: "/privacy", terms: "/terms" };
    const target = paths[next] || "/";
    if (window.location.pathname !== target) {
      window.history.pushState(null, "", target);
    }
    setView(next);
  };

  const wrap = (screen) => (
    <>
      <TtsErrorToast visible={ttsError} />
      <PaywallModal isOpen={!!showPaywall} reason={showPaywall} onClose={() => setShowPaywall(false)} />
      {screen}
    </>
  );

  if (view==="success") return wrap(<SuccessScreen onNavigate={navigate} />);
  if (view==="home")    return wrap(<HomeScreen onNavigate={navigate} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  if (view==="library") return wrap(<LibraryScreen onNavigate={navigate} library={library} votes={votes} onVote={handleVote} speak={speak} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  if (view==="create")  return wrap(<CreateScreen onNavigate={navigate} onStoryAdded={setLibrary} currentLibrary={library} selectedLanguage={selectedLanguage} onLanguageChange={setSelectedLanguage} setShowPaywall={setShowPaywall} onStoryGenerated={onStoryGenerated} isPremium={isPremium} storyCount={storyCount}/>);
  if (view==="about")   return wrap(<AboutScreen onNavigate={navigate} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  if (view==="contact") return wrap(<ContactScreen onNavigate={navigate} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  if (view==="privacy") return wrap(<PrivacyPolicyScreen onNavigate={navigate} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  if (view==="terms")   return wrap(<TermsOfServiceScreen onNavigate={navigate} isPremium={isPremium} setShowPaywall={setShowPaywall}/>);
  return null;
}
