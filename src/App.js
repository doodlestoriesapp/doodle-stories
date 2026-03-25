import { useState, useRef, useCallback, useEffect } from "react";

// ── Constants ────────────────────────────────────────────────────
const AGE_GROUPS = [
  { label: "Tiny Tots",      range: "2–4",  emoji: "🍼", prompt: "very simple, 2-3 sentences, magical and whimsical, easy words" },
  { label: "Little Readers", range: "5–7",  emoji: "📚", prompt: "3-4 short paragraphs, adventurous and fun, simple vocabulary" },
  { label: "Story Lovers",   range: "8–10", emoji: "🌟", prompt: "4-5 paragraphs, imaginative with some twists, richer vocabulary" },
  { label: "Big Kids",       range: "11–13",emoji: "🚀", prompt: "5-6 paragraphs, exciting plot with a surprise ending, expressive language" },
];

const VOICE_LINES = {
  1: "Woohoo! Welcome to Doodle Stories! You can upload your drawing OR draw one right here! Let's make some magic!",
  draw: "Time to get creative! Pick a colour, grab the brush, and draw anything you like! When you're done tap Use This Doodle!",
  2: "Ooooh what an AMAZING drawing! Now... how old is the little artist?",
  ageSelected: "Let's go make a story by tapping the big orange Make My Story button!",
  loading: "Hold on to your crayons! The story magic is happening right now! Your drawing is coming to LIFE!",
  story: "Ta-daaa! Your very own story is ready! A parent can save it to the bedtime library for other kids to enjoy!",
  library: "Welcome to the Bedtime Story Library! Every story here was made from a real kid's drawing! Pick one and snuggle up!",
  loved: "Oh my goodness! That story just got a LOVE! The author must be SO proud!",
  liked: "Wow, someone loved that story! What an amazing little author!",
};

const PALETTE = [
  "#000000","#FFFFFF","#FF6B6B","#FF8E53","#FFD93D","#6BCB77",
  "#4D96FF","#9B59B6","#FF69B4","#A0522D","#708090","#00CED1",
];

const BRUSH_SIZES = [3, 7, 13, 20];

const COLORS = {
  bg:"#FFF9F0", card:"#FFFFFF",
  accent1:"#FF6B6B", accent2:"#FFD93D", accent3:"#6BCB77", accent4:"#4D96FF", accent5:"#FF4ECD",
  night1:"#1a1035", night2:"#2d1b6e", night3:"#4a2fa0",
  text:"#2D2D2D", muted:"#8A8A8A", border:"#F0E6D3",
};

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

// ── Speech ───────────────────────────────────────────────────────
function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const playingRef = useRef(false);

  const playNext = useCallback(async () => {
    if (playingRef.current || queueRef.current.length === 0) return;
    const { text, prompt } = queueRef.current.shift();
    playingRef.current = true;
    setSpeaking(true);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, prompt }),
      });
      const data = await res.json();

      if (data.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        audioRef.current = audio;
        audio.onended = () => {
          playingRef.current = false;
          audioRef.current = null;
          if (queueRef.current.length > 0) {
            playNext();
          } else {
            setSpeaking(false);
          }
        };
        audio.onerror = () => {
          playingRef.current = false;
          audioRef.current = null;
          fallbackSpeak(text);
        };
        audio.play();
      } else {
        playingRef.current = false;
        fallbackSpeak(text);
      }
    } catch {
      playingRef.current = false;
      fallbackSpeak(text);
    }
  }, []);

  const fallbackSpeak = (text) => {
    if (!window.speechSynthesis) { setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate=1.25; utter.pitch=1.5; utter.volume=1;
    utter.onend=()=>{ playingRef.current=false; setSpeaking(false); };
    utter.onerror=()=>{ playingRef.current=false; setSpeaking(false); };
    window.speechSynthesis.speak(utter);
  };

  const speak = useCallback((text, prompt) => {
    // Clear queue and stop current — fresh line takes priority
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    playingRef.current = false;
    setSpeaking(false);
    // Add to queue and play
    queueRef.current.push({ text, prompt });
    playNext();
  }, [playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    playingRef.current = false;
    setSpeaking(false);
  }, []);

  return { speak, stop, speaking };
}

// ── Storage ──────────────────────────────────────────────────────
async function loadLibrary() { try { const r=await window.storage.get("doodle-library",true); return r?JSON.parse(r.value):[]; } catch { return []; } }
async function saveLibrary(s) { try { await window.storage.set("doodle-library",JSON.stringify(s),true); } catch {} }
async function loadVotes() { try { const r=await window.storage.get("doodle-votes",false); return r?JSON.parse(r.value):{}; } catch { return {}; } }
async function saveVotes(v) { try { await window.storage.set("doodle-votes",JSON.stringify(v),false); } catch {} }

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
    speak(VOICE_LINES.draw);
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
        <canvas ref={canvasRef} width={600} height={400} style={{ width:"100%", aspectRatio:"3/2", display:"block", cursor:tool==="fill"?"crosshair":tool==="eraser"?"cell":"default", borderLeft:`2px solid ${COLORS.border}`, borderRight:`2px solid ${COLORS.border}`, touchAction:"none", background:"white" }}
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
      {story.doodleUrl&&<img src={story.doodleUrl} alt="doodle" style={{width:"100%",height:110,objectFit:"cover",borderRadius:10,marginBottom:10,border:`3px solid ${nightMode?"rgba(255,255,255,0.15)":"white"}`,boxShadow:"0 2px 8px rgba(0,0,0,0.1)"}}/>}
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
  const { speak, stop, speaking } = useSpeech();
  useEffect(()=>()=>stop(),[stop]);
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
        {story.doodleUrl&&<img src={story.doodleUrl} alt="doodle" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:14,marginBottom:18,border:`4px solid ${nightMode?"rgba(255,255,255,0.1)":"white"}`,boxShadow:"0 6px 20px rgba(0,0,0,0.15)"}}/>}
        <button onClick={()=>speaking?stop():speak(`${story.title}. ${story.text}`)} style={{width:"100%",padding:"11px",borderRadius:14,border:"none",marginBottom:4,background:speaking?`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`,color:"white",fontSize:"0.95rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>
          {speaking?"⏹ Stop Reading":"🔊 Read This Story Aloud"}
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
        <h2 style={{margin:"0 0 10px",color:COLORS.text,fontSize:"1.25rem"}}>Share with the Library?</h2>
        <p style={{color:COLORS.muted,fontSize:"0.9rem",lineHeight:1.6,margin:"0 0 22px"}}>
          Would you like to share <strong style={{color:COLORS.text}}>"{story.title}"</strong> in the Bedtime Story Library?
          Other kids can like and love it — posted <strong>anonymously</strong>, no names shared.
        </p>
        <div style={{display:"flex",gap:10,flexDirection:"column"}}>
          <button onClick={()=>onSave(true)} style={{padding:"13px",borderRadius:16,border:"none",background:`linear-gradient(135deg,${COLORS.accent3},#3BB54A)`,color:"white",fontSize:"1rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 6px 20px rgba(107,203,119,0.35)",fontFamily:"Georgia,serif"}}>✨ Yes, share it!</button>
          <button onClick={()=>onSave(false)} style={{padding:"13px",borderRadius:16,border:`2px solid ${COLORS.border}`,background:"transparent",color:COLORS.muted,fontSize:"1rem",cursor:"pointer"}}>Keep it just for us</button>
        </div>
      </div>
    </div>
  );
}

// ── HOME ─────────────────────────────────────────────────────────
function HomeScreen({ onNavigate, topLoved, topLiked, onRead }) {
  const HeroCard = ({ story, rank, accent }) => (
    <div onClick={()=>onRead(story)} style={{background:"white",borderRadius:18,padding:"14px 16px",cursor:"pointer",border:`2px solid ${accent}30`,boxShadow:`0 5px 20px ${accent}20`,position:"relative",transition:"transform 0.2s"}}
    onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
      <div style={{position:"absolute",top:-10,left:14,background:accent,color:"white",borderRadius:20,padding:"2px 10px",fontSize:"0.72rem",fontWeight:"bold"}}>#{rank}</div>
      {story.doodleUrl&&<img src={story.doodleUrl} alt="" style={{width:"100%",height:85,objectFit:"cover",borderRadius:10,marginBottom:8,border:"3px solid white"}}/>}
      <div style={{fontSize:"0.66rem",color:COLORS.muted,marginBottom:2}}>{story.ageEmoji} {story.ageLabel}</div>
      <h4 style={{margin:"0 0 5px",fontSize:"0.88rem",color:COLORS.text,lineHeight:1.3}}>{story.title}</h4>
      <div style={{display:"flex",gap:7}}>
        <span style={{fontSize:"0.76rem",color:COLORS.accent5,fontWeight:"bold"}}>❤️ {story.loves||0}</span>
        <span style={{fontSize:"0.76rem",color:"#b8860b",fontWeight:"bold"}}>👍 {story.likes||0}</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif",position:"relative",overflow:"hidden"}}>
      <style>{`
        @keyframes mascotBounce{from{transform:translateY(0)}to{transform:translateY(-5px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes dot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}
        @keyframes twinkle{from{opacity:0.2}to{opacity:0.8}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes confettiFall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
      `}</style>
      <div style={{position:"fixed",top:-80,right:-80,width:300,height:300,borderRadius:"50%",background:"rgba(255,107,107,0.12)",zIndex:0}}/>
      <div style={{position:"fixed",bottom:-60,left:-60,width:250,height:250,borderRadius:"50%",background:"rgba(77,150,255,0.10)",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,maxWidth:640,margin:"0 auto",padding:"44px 24px 60px"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:66,marginBottom:12,animation:"float 3s infinite ease-in-out"}}>🎨</div>
          <h1 style={{fontSize:"clamp(2rem,6vw,3rem)",color:COLORS.text,margin:"0 0 10px",lineHeight:1.1,letterSpacing:"-0.02em"}}>
            Doodle <span style={{color:COLORS.accent1}}>Stories</span>
          </h1>
          <p style={{color:COLORS.muted,fontSize:"1rem",fontStyle:"italic",margin:"0 0 34px",lineHeight:1.6}}>
            Draw it. Upload it. Turn it into a magical story.<br/>Share it as a bedtime story for the world. 🌙
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>onNavigate("create")} style={{padding:"16px 32px",borderRadius:20,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"1.08rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 8px 28px rgba(255,107,107,0.35)",fontFamily:"Georgia,serif",transition:"transform 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              🖼️ Create a Story from My Doodle
            </button>
            <button onClick={()=>onNavigate("library")} style={{padding:"16px 32px",borderRadius:20,border:"none",background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,color:"white",fontSize:"1.08rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 8px 28px rgba(45,27,110,0.35)",fontFamily:"Georgia,serif",transition:"transform 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              🌙 Bedtime Story Library
            </button>
          </div>
        </div>
        {topLoved.length>0&&(
          <div style={{marginBottom:32}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <span style={{fontSize:22}}>🏆</span>
              <div><h2 style={{margin:0,fontSize:"1.1rem",color:COLORS.text}}>Most Loved Stories</h2><p style={{margin:0,fontSize:"0.75rem",color:COLORS.muted}}>Voted by kids everywhere</p></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
              {topLoved.slice(0,3).map((s,i)=><HeroCard key={s.id} story={s} rank={i+1} accent={COLORS.accent5}/>)}
            </div>
          </div>
        )}
        {topLiked.length>0&&(
          <div style={{marginBottom:32}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <span style={{fontSize:22}}>⭐</span>
              <div><h2 style={{margin:0,fontSize:"1.1rem",color:COLORS.text}}>Most Liked Stories</h2><p style={{margin:0,fontSize:"0.75rem",color:COLORS.muted}}>Popular picks</p></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
              {topLiked.slice(0,3).map((s,i)=><HeroCard key={s.id} story={s} rank={i+1} accent={COLORS.accent2}/>)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:40,paddingTop:24,borderTop:`1px solid ${COLORS.border}`}}>
          <p style={{color:COLORS.muted,fontSize:"0.78rem",margin:"0 0 10px"}}>Made with ❤️ for little storytellers everywhere</p>
          <div style={{display:"flex",justifyContent:"center",gap:20}}>
            <button onClick={()=>onNavigate("about")} style={{background:"none",border:"none",cursor:"pointer",color:COLORS.muted,fontSize:"0.82rem",fontFamily:"Georgia,serif",textDecoration:"underline"}}>About Us</button>
            <button onClick={()=>onNavigate("contact")} style={{background:"none",border:"none",cursor:"pointer",color:COLORS.muted,fontSize:"0.82rem",fontFamily:"Georgia,serif",textDecoration:"underline"}}>Contact Us</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LIBRARY ──────────────────────────────────────────────────────
function LibraryScreen({ onNavigate, library, votes, onVote, speak }) {
  const [tab,setTab]=useState("all");
  const [filterAge,setFilterAge]=useState("all");
  const [searchQuery,setSearchQuery]=useState("");
  const [readingStory,setReadingStory]=useState(null);
  const [nightMode,setNightMode]=useState(false);
  const [showConfetti,setShowConfetti]=useState(false);
  const spokenLib=useRef(false);

  useEffect(()=>{ if(!spokenLib.current){spokenLib.current=true;setTimeout(()=>speak(VOICE_LINES.library),500);} },[speak]);

  const handleVote=(id,type)=>{ onVote(id,type); setShowConfetti(true); speak(type==="love"?VOICE_LINES.loved:VOICE_LINES.liked); if(readingStory?.id===id) setReadingStory(s=>s?{...s,[type==="love"?"loves":"likes"]:(s[type==="love"?"loves":"likes"]||0)+1}:s); };

  const sorted=(tab==="loved"?[...library].sort((a,b)=>(b.loves||0)-(a.loves||0)):tab==="liked"?[...library].sort((a,b)=>(b.likes||0)-(a.likes||0)):library);
  const filtered=sorted.filter(s=>{
    const am=filterAge==="all"||s.ageLabel===filterAge;
    const q=searchQuery.toLowerCase();
    return am&&(!q||s.title.toLowerCase().includes(q)||s.preview.toLowerCase().includes(q)||(s.tags||[]).some(t=>t.toLowerCase().includes(q)));
  });

  const nBg=nightMode?`linear-gradient(160deg,${COLORS.night1} 0%,${COLORS.night2} 60%,#0d0826 100%)`:`radial-gradient(ellipse at 20% 20%,#E8F4FF 0%,#FFF9F0 60%,#FFE8D6 100%)`;

  return (
    <div style={{minHeight:"100vh",background:nBg,fontFamily:"Georgia,serif",position:"relative",overflow:"hidden",transition:"background 0.5s"}}>
      {nightMode&&<StarryBg/>}
      <Confetti active={showConfetti} onDone={()=>setShowConfetti(false)}/>
      <div style={{position:"relative",zIndex:1,maxWidth:820,margin:"0 auto",padding:"30px 20px 60px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${nightMode?"rgba(255,255,255,0.2)":COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:nightMode?"white":COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
          <div style={{textAlign:"center"}}><h1 style={{margin:0,fontSize:"clamp(1.2rem,4vw,1.8rem)",color:nightMode?"white":COLORS.text}}>🌙 Bedtime Library</h1><p style={{margin:"2px 0 0",fontSize:"0.74rem",color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted,fontStyle:"italic"}}>Stories by kids, for kids</p></div>
          <button onClick={()=>setNightMode(n=>!n)} style={{background:nightMode?"rgba(255,255,255,0.1)":COLORS.card,border:`2px solid ${nightMode?"rgba(255,255,255,0.2)":COLORS.border}`,borderRadius:12,padding:"7px 12px",cursor:"pointer",color:nightMode?"white":COLORS.text,fontSize:"0.95rem"}}>{nightMode?"☀️":"🌙"}</button>
        </div>
        <div style={{display:"flex",gap:7,marginBottom:18,flexWrap:"wrap"}}>
          {[["all","✨ All"],["loved","🏆 Most Loved"],["liked","⭐ Most Liked"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{padding:"8px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:"0.82rem",fontWeight:"bold",fontFamily:"Georgia,serif",transition:"all 0.15s",background:tab===key?(key==="loved"?`linear-gradient(135deg,${COLORS.accent5},#FF8E53)`:key==="liked"?`linear-gradient(135deg,${COLORS.accent2},#FF8E53)`:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`):(nightMode?"rgba(255,255,255,0.08)":"white"),color:tab===key?"white":(nightMode?"rgba(255,255,255,0.6)":COLORS.muted),boxShadow:tab===key?"0 4px 14px rgba(0,0,0,0.15)":"none"}}>{label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
          <input type="text" placeholder="🔍 Search stories, themes..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{flex:1,minWidth:150,padding:"8px 13px",borderRadius:12,border:`2px solid ${nightMode?"rgba(255,255,255,0.15)":COLORS.border}`,background:nightMode?"rgba(255,255,255,0.07)":"white",color:nightMode?"white":COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif",outline:"none"}}/>
          <button onClick={()=>{const idx=["all",...AGE_GROUPS.map(a=>a.label)];setFilterAge(idx[(idx.indexOf(filterAge)+1)%idx.length]);}} style={{padding:"8px 13px",borderRadius:12,cursor:"pointer",fontSize:"0.82rem",fontFamily:"Georgia,serif",border:`2px solid ${filterAge!=="all"?COLORS.accent1:(nightMode?"rgba(255,255,255,0.15)":COLORS.border)}`,background:filterAge!=="all"?"rgba(255,107,107,0.1)":(nightMode?"rgba(255,255,255,0.07)":"white"),color:filterAge!=="all"?COLORS.accent1:(nightMode?"white":COLORS.text)}}>
            {filterAge==="all"?"All Ages ↓":AGE_GROUPS.find(a=>a.label===filterAge)?.emoji+" "+filterAge}
          </button>
          <button onClick={()=>{if(filtered.length>0)setReadingStory(filtered[Math.floor(Math.random()*filtered.length)]);}} style={{padding:"8px 13px",borderRadius:12,cursor:"pointer",fontSize:"0.82rem",fontFamily:"Georgia,serif",border:`2px solid ${nightMode?"rgba(255,255,255,0.15)":COLORS.border}`,background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,color:"white"}}>🎲 Random</button>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:20,flexWrap:"wrap"}}>
          {["all",...AGE_GROUPS.map(a=>a.label)].map(label=>(
            <button key={label} onClick={()=>setFilterAge(label)} style={{padding:"4px 11px",borderRadius:20,border:"none",cursor:"pointer",fontSize:"0.74rem",background:filterAge===label?COLORS.accent1:(nightMode?"rgba(255,255,255,0.08)":COLORS.border),color:filterAge===label?"white":(nightMode?"rgba(255,255,255,0.6)":COLORS.muted),transition:"all 0.15s"}}>
              {label==="all"?"✨ All":AGE_GROUPS.find(a=>a.label===label)?.emoji+" "+label}
            </button>
          ))}
        </div>
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:"52px 20px"}}>
            <div style={{fontSize:44,marginBottom:12}}>{library.length===0?"📭":"🔍"}</div>
            <h3 style={{color:nightMode?"rgba(255,255,255,0.5)":COLORS.muted,fontWeight:"normal"}}>{library.length===0?"No stories yet! Be the first!":"No stories match your search."}</h3>
            {library.length===0&&<button onClick={()=>onNavigate("create")} style={{marginTop:12,padding:"11px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.95rem",cursor:"pointer",fontFamily:"Georgia,serif"}}>🎨 Create the First Story!</button>}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
          {filtered.map((s,i)=><StoryCard key={s.id} story={s} onRead={setReadingStory} nightMode={nightMode} votes={votes} onVote={handleVote} highlight={tab==="loved"&&i<3}/>)}
        </div>
        <div style={{textAlign:"center",marginTop:32}}>
          <button onClick={()=>onNavigate("create")} style={{padding:"12px 24px",borderRadius:16,border:"none",background:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"0.92rem",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:"0 6px 20px rgba(255,107,107,0.3)"}}>🎨 Add Your Story</button>
        </div>
      </div>
      {readingStory&&<ReadingModal story={readingStory} onClose={()=>setReadingStory(null)} nightMode={nightMode} votes={votes} onVote={handleVote}/>}
    </div>
  );
}

// ── CREATE ───────────────────────────────────────────────────────
function CreateScreen({ onNavigate, onStoryAdded }) {
  const [mode, setMode] = useState(null);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [ageGroup, setAgeGroup] = useState(null);
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const fileRef = useRef();
  const { speak, stop, speaking } = useSpeech();
  const spokenKeys = useRef(new Set());

  const getVoiceKey=(s,l,st)=>s===3&&l?"loading":s===3&&st?"story":String(s);

  useEffect(()=>{
    if(!voiceEnabled) return;
    const key=getVoiceKey(step,loading,story);
    if(spokenKeys.current.has(key)) return;
    spokenKeys.current.add(key);
    const t=setTimeout(()=>{if(VOICE_LINES[key])speak(VOICE_LINES[key]);},500);
    return()=>clearTimeout(t);
  },[step,loading,story,voiceEnabled,speak]);

  const replayVoice=()=>{const key=getVoiceKey(step,loading,story);if(VOICE_LINES[key])speak(VOICE_LINES[key]);};

  const handleFile=useCallback((file)=>{
    if(!file||!file.type.startsWith("image/")) return;
    setImage(URL.createObjectURL(file));
    const reader=new FileReader();
    reader.onload=e=>{setImageBase64(e.target.result.split(",")[1]);spokenKeys.current.delete("2");setStep(2);};
    reader.readAsDataURL(file);
  },[]);

  const handleCanvasUse=(dataURL,base64)=>{
    setImage(dataURL); setImageBase64(base64);
    spokenKeys.current.delete("2"); setMode(null); setStep(2);
  };

  const handleDrop=(e)=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);};

  const generateStory=async()=>{
    if(!imageBase64||!ageGroup) return;
    setLoading(true);setError(null);spokenKeys.current.delete("loading");setStep(3);
    try {
      const res=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:1000,
        system:`You are a magical children's storyteller. Create a delightful story from a child's drawing. The story should feel personal, as if the drawing came to life. Also generate 3-5 topic tags. Format ONLY as JSON: {"title":"...","story":"...","tags":["..."]} No markdown, no backticks, raw JSON only.`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/png",data:imageBase64}},{type:"text",text:`Create a story for a ${ageGroup.range} year old. Style: ${ageGroup.prompt}. Make THEIR drawing the hero.`}]}],
      })});
      const data=await res.json();
      const text=data.content?.find(b=>b.type==="text")?.text||"";
      const parsed=JSON.parse(text);
      spokenKeys.current.delete("story");setStory(parsed);
    } catch {setError("Oops! The story magic fizzled. Try again!");setStep(2);}
    finally{setLoading(false);}
  };

  const handleSave=async(share)=>{
    setShowSaveModal(false);
    if(!share||!story) return;
    const existing=await loadLibrary();
    const newEntry={id:Date.now(),title:story.title,text:story.story,preview:story.story.split("\n\n")[0].slice(0,120)+"...",tags:story.tags||[],ageLabel:ageGroup.label,ageEmoji:ageGroup.emoji,ageRange:ageGroup.range,doodleUrl:image,likes:0,loves:0,date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})};
    const updated=[newEntry,...existing];
    await saveLibrary(updated);onStoryAdded(updated);
  };

  const reset=()=>{stop();setImage(null);setImageBase64(null);setAgeGroup(null);setStory(null);setError(null);setMode(null);spokenKeys.current.clear();setStep(1);};

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
          <button onClick={()=>onNavigate("library")} style={{background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,border:"none",borderRadius:12,padding:"7px 13px",cursor:"pointer",color:"white",fontSize:"0.8rem",fontFamily:"Georgia,serif"}}>🌙 Library</button>
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
              <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current.click()} style={{border:`3px dashed ${dragOver?COLORS.accent1:COLORS.border}`,borderRadius:22,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(255,107,107,0.04)":COLORS.card,transition:"all 0.2s",boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
                <div style={{fontSize:44,marginBottom:10}}>📸</div>
                <h3 style={{color:COLORS.text,fontSize:"1rem",margin:"0 0 5px",fontWeight:"bold"}}>Upload Drawing</h3>
                <p style={{color:COLORS.muted,margin:0,fontSize:"0.78rem",lineHeight:1.4}}>Tap to upload a photo of your drawing</p>
              </div>
              <div onClick={()=>setMode("draw")} style={{border:`3px solid ${COLORS.border}`,borderRadius:22,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:COLORS.card,transition:"all 0.2s",boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=COLORS.accent3;e.currentTarget.style.background="rgba(107,203,119,0.04)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.background=COLORS.card;}}>
                <div style={{fontSize:44,marginBottom:10}}>✏️</div>
                <h3 style={{color:COLORS.text,fontSize:"1rem",margin:"0 0 5px",fontWeight:"bold"}}>Draw Here!</h3>
                <p style={{color:COLORS.muted,margin:0,fontSize:"0.78rem",lineHeight:1.4}}>Create your doodle right in the app</p>
              </div>
            </div>
            <p style={{textAlign:"center",color:"#ccc",fontSize:"0.74rem",margin:0}}>Any drawing turns into a magical story ✨</p>
          </div>
        )}
        {step===1&&mode==="draw"&&(
          <DoodlePad onUse={handleCanvasUse} onCancel={()=>setMode(null)}/>
        )}
        {step===2&&(
          <div>
            <VoiceBubble text={VOICE_LINES[2]}/>
            {image&&<div style={{textAlign:"center",marginBottom:18}}><img src={image} alt="Doodle" style={{maxWidth:"100%",maxHeight:170,borderRadius:14,boxShadow:"0 12px 40px rgba(0,0,0,0.12)",border:"4px solid white"}}/><p style={{color:COLORS.muted,fontSize:"0.8rem",marginTop:6,fontStyle:"italic"}}>What an AMAZING drawing! 🌟</p></div>}
            <h2 style={{textAlign:"center",color:COLORS.text,fontSize:"1rem",fontWeight:"normal",marginBottom:12}}>How old is the little artist? 👇</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:14}}>
              {AGE_GROUPS.map(group=>(
                <button key={group.range} onClick={()=>{ setAgeGroup(group); stop(); setTimeout(()=>speak(VOICE_LINES.ageSelected),300); }} style={{padding:"13px 10px",borderRadius:14,border:`3px solid ${ageGroup?.range===group.range?COLORS.accent1:COLORS.border}`,background:ageGroup?.range===group.range?"rgba(255,107,107,0.06)":COLORS.card,cursor:"pointer",transition:"all 0.2s",boxShadow:ageGroup?.range===group.range?`0 6px 20px rgba(255,107,107,0.2)`:"0 4px 12px rgba(0,0,0,0.04)",transform:ageGroup?.range===group.range?"scale(1.03)":"scale(1)"}}>
                  <div style={{fontSize:24,marginBottom:3}}>{group.emoji}</div>
                  <div style={{fontWeight:"bold",color:COLORS.text,fontSize:"0.85rem"}}>{group.label}</div>
                  <div style={{color:COLORS.muted,fontSize:"0.72rem",marginTop:1}}>Ages {group.range}</div>
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={reset} style={{flex:1,padding:"11px",borderRadius:13,border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",color:COLORS.muted,fontSize:"0.86rem"}}>← New Doodle</button>
              <button onClick={generateStory} disabled={!ageGroup} style={{flex:2,padding:"11px",borderRadius:13,border:"none",background:ageGroup?`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`:COLORS.border,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:ageGroup?"pointer":"not-allowed",boxShadow:ageGroup?"0 6px 20px rgba(255,107,107,0.35)":"none",fontFamily:"Georgia,serif"}}>✨ Make My Story!</button>
            </div>
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
            {error&&<div style={{textAlign:"center",padding:28}}><div style={{fontSize:38}}>😬</div><p style={{color:COLORS.accent1}}>{error}</p><button onClick={()=>setStep(2)} style={{padding:"9px 22px",borderRadius:12,border:"none",background:COLORS.accent1,color:"white",cursor:"pointer",fontSize:"0.9rem"}}>Try Again</button></div>}
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
                <button onClick={()=>setShowSaveModal(true)} style={{width:"100%",padding:"12px",borderRadius:14,border:"none",marginBottom:9,background:`linear-gradient(135deg,${COLORS.night2},${COLORS.night3})`,color:"white",fontSize:"0.92rem",fontWeight:"bold",cursor:"pointer",boxShadow:"0 6px 20px rgba(45,27,110,0.3)",fontFamily:"Georgia,serif"}}>🌙 Save to Bedtime Library</button>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={reset} style={{flex:1,padding:"10px",borderRadius:12,border:`2px solid ${COLORS.border}`,background:"transparent",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>🎨 New Doodle</button>
                  <button onClick={()=>{setStory(null);spokenKeys.current.delete("loading");spokenKeys.current.delete("story");generateStory();}} style={{flex:1,padding:"10px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${COLORS.accent4},#7B61FF)`,color:"white",fontSize:"0.86rem",cursor:"pointer",fontFamily:"Georgia,serif",boxShadow:"0 6px 20px rgba(77,150,255,0.3)"}}>✨ New Story</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showSaveModal&&story&&<SaveModal story={story} onSave={handleSave}/>}
    </div>
  );
}

// ── ABOUT ────────────────────────────────────────────────────────
function AboutScreen({ onNavigate }) {
  const SOCIALS = [
    { icon: "🎵", label: "TikTok", url: "https://tiktok.com/@doodlestoriesapp" },
    { icon: "📸", label: "Instagram", url: "https://instagram.com/doodlestoriesapp" },
    { icon: "▶️", label: "YouTube", url: "https://youtube.com/@DoodleStoriesapp" },
    { icon: "📘", label: "Facebook", url: "https://facebook.com/doodlestoriesapp" },
  ];
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:680,margin:"0 auto",padding:"30px 24px 60px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:32}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
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
          <p style={{color:COLORS.text,lineHeight:1.85,fontSize:"0.95rem",margin:0}}>We built Doodle Stories to change that. Upload or draw a doodle, pick an age group, and watch as AI transforms that drawing into a personalized story — narrated, shareable, and saved forever in our Bedtime Story Library for kids everywhere to enjoy.</p>
        </div>
        <div style={{background:"white",borderRadius:20,padding:"24px 28px",marginBottom:20,border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
          <h2 style={{color:COLORS.text,fontSize:"1.1rem",margin:"0 0 16px"}}>What We Believe 💛</h2>
          {[
            ["🎨","Every child is a storyteller","Their imagination just needs a little magic to come alive."],
            ["🌍","Stories connect us","A child's drawing in Houston can inspire a bedtime story in London."],
            ["🔒","Kids deserve safe spaces","No accounts required. No personal data collected. Just creativity."],
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
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:14,border:`2px solid ${COLORS.border}`,textDecoration:"none",color:COLORS.text,background:"#FAFAFA",fontSize:"0.9rem",fontFamily:"Georgia,serif",transition:"all 0.2s"}}
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
function ContactScreen({ onNavigate }) {
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
    } catch {setError("Something went wrong. Please email us directly at doodlestoriesapp@gmail.com");}
    setSending(false);
  };
  const inputStyle={width:"100%",padding:"12px 14px",borderRadius:12,border:`2px solid ${COLORS.border}`,fontSize:"0.92rem",fontFamily:"Georgia,serif",color:COLORS.text,background:"white",outline:"none",boxSizing:"border-box",marginTop:6};
  const labelStyle={fontSize:"0.82rem",fontWeight:"bold",color:COLORS.text,display:"block"};
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 20% 20%,#FFE8D6 0%,#FFF9F0 40%,#E8F4FF 100%)`,fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:620,margin:"0 auto",padding:"30px 24px 60px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:32}}>
          <button onClick={()=>onNavigate("home")} style={{background:"none",border:`2px solid ${COLORS.border}`,borderRadius:12,padding:"7px 13px",cursor:"pointer",color:COLORS.text,fontSize:"0.86rem",fontFamily:"Georgia,serif"}}>← Home</button>
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
              <button onClick={handleSubmit} disabled={sending} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:sending?COLORS.border:`linear-gradient(135deg,${COLORS.accent1},#FF8E53)`,color:"white",fontSize:"1rem",fontWeight:"bold",cursor:sending?"not-allowed":"pointer",boxShadow:sending?"none":"0 6px 20px rgba(255,107,107,0.35)",fontFamily:"Georgia,serif"}}>
                {sending?"Sending...":"✉️ Send Message"}
              </button>
              <p style={{textAlign:"center",color:COLORS.muted,fontSize:"0.78rem",margin:"14px 0 0"}}>Or email us directly at <strong>doodlestoriesapp@gmail.com</strong></p>
            </div>
            <div style={{background:"white",borderRadius:20,padding:"20px 28px",border:`1px solid ${COLORS.border}`,boxShadow:"0 6px 24px rgba(0,0,0,0.06)"}}>
              <p style={{color:COLORS.text,fontSize:"0.88rem",fontWeight:"bold",margin:"0 0 12px"}}>Follow us on social media</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {SOCIALS.map(s=>(
                  <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:12,border:`2px solid ${COLORS.border}`,textDecoration:"none",color:COLORS.text,background:"#FAFAFA",fontSize:"0.86rem",fontFamily:"Georgia,serif",transition:"all 0.2s"}}
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
export default function App() {
  const [view,setView]=useState("home");
  const [library,setLibrary]=useState([]);
  const [votes,setVotes]=useState({});
  const { speak }=useSpeech();

  useEffect(()=>{
    Promise.all([loadLibrary(),loadVotes()]).then(([lib,v])=>{ setLibrary(lib); setVotes(v); });
  },[]);

  const handleVote=async(id,type)=>{
    if(votes[id]) return;
    const newVotes={...votes,[id]:type};
    setVotes(newVotes); await saveVotes(newVotes);
    const updated=library.map(s=>s.id===id?{...s,[type==="love"?"loves":"likes"]:(s[type==="love"?"loves":"likes"]||0)+1}:s);
    setLibrary(updated); await saveLibrary(updated);
  };

  const topLoved=[...library].sort((a,b)=>(b.loves||0)-(a.loves||0)).filter(s=>(s.loves||0)>0);
  const topLiked=[...library].sort((a,b)=>(b.likes||0)-(a.likes||0)).filter(s=>(s.likes||0)>0);

  if(view==="home") return <HomeScreen onNavigate={setView} topLoved={topLoved} topLiked={topLiked} onRead={()=>setView("library")}/>;
  if(view==="library") return <LibraryScreen onNavigate={setView} library={library} votes={votes} onVote={handleVote} speak={speak}/>;
  if(view==="create") return <CreateScreen onNavigate={setView} onStoryAdded={setLibrary}/>;
  if(view==="about") return <AboutScreen onNavigate={setView}/>;
  if(view==="contact") return <ContactScreen onNavigate={setView}/>;
  return null;
}
