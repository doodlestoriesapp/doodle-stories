import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { getStroke } from 'perfect-freehand';
import { captureRef } from 'react-native-view-shot';       // included in Expo Go
import UPNG from 'upng-js';
import { toByteArray, fromByteArray } from 'base64-js';

// ---------- freehand path helpers ----------
function toPathData(stroke) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

const BASE_OPTIONS = { thinning: 0.6, smoothing: 0.5, streamline: 0.5 };

const COLORS = [
  '#1a1a1a', '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#1e88e5', '#8e24aa', '#ec407a', '#6d4c41', '#ffffff',
];
const SIZES = [8, 16, 30];

// ---------- flood fill config ----------
const FILL_RES = 512;   // pixel resolution we rasterize the canvas to for filling
const TOLERANCE = 40;   // per-channel color match slack; higher = fills across softer edges
const EXPORT_RES = 1024; // resolution of the image handed to the story generator

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Iterative flood fill over an RGBA/RGB byte array. Matches by RGB distance so it
// stops at the dark pen strokes (which act as boundaries).
function floodFill(data, w, h, sx, sy, fill, tol, channels) {
  const at = (p) => p * channels;
  const start = sy * w + sx;
  const si = at(start);
  const tr = data[si], tg = data[si + 1], tb = data[si + 2];
  // already the fill color? nothing to do
  if (Math.abs(tr - fill[0]) <= 2 && Math.abs(tg - fill[1]) <= 2 && Math.abs(tb - fill[2]) <= 2) return false;

  const tol2 = tol * tol;
  const matches = (i) => {
    const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  const seen = new Uint8Array(w * h);
  const stack = [start];
  let changed = false;
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    const i = at(p);
    if (!matches(i)) continue;
    seen[p] = 1;
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2];
    if (channels === 4) data[i + 3] = 255;
    changed = true;
    const x = p % w, y = (p / w) | 0;
    if (x + 1 < w) stack.push(p + 1);
    if (x > 0) stack.push(p - 1);
    if (y + 1 < h) stack.push(p + w);
    if (y > 0) stack.push(p - w);
  }
  return changed;
}

// onDone(base64, mediaType) -> hand the finished drawing to the story flow
// onCancel()                -> back out without using the drawing
export default function DoodleCanvas({ onDone, onCancel }) {
  // layers: ordered mix of { type:'stroke', d, color } and { type:'raster', uri }
  const [layers, setLayers] = useState([]);
  const [currentD, setCurrentD] = useState('');
  const [color, setColor] = useState('#1a1a1a');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [size, setSize] = useState(16);
  const [tool, setTool] = useState('draw'); // 'draw' | 'fill' | 'page'
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const pointsRef = useRef([]);
  const canvasRef = useRef(null);
  const canvasSize = useRef({ width: 1, height: 1 });

  // Only the last raster covers everything before it, so we render that plus the
  // strokes drawn on top of it. Undo just pops the last layer.
  let lastRaster = -1;
  for (let i = layers.length - 1; i >= 0; i--) { if (layers[i].type === 'raster') { lastRaster = i; break; } }
  const baseUri = lastRaster >= 0 ? layers[lastRaster].uri : null;
  const topStrokes = layers.slice(lastRaster + 1);

  const isEmpty = layers.length === 0;

  const build = () => toPathData(getStroke(pointsRef.current, { ...BASE_OPTIONS, size }));

  const startStroke = (x, y) => { pointsRef.current = [[x, y]]; setCurrentD(build()); };
  const pushPoint = (x, y) => { pointsRef.current.push([x, y]); setCurrentD(build()); };
  const endStroke = () => {
    const d = build();
    pointsRef.current = [];
    setLayers((prev) => [...prev, { type: 'stroke', d, color }]);
    setCurrentD('');
  };

  const floodFillAt = async (x, y) => {
    if (busy || saving) return;
    setBusy(true);
    try {
      const { width: cw, height: ch } = canvasSize.current;
      const W = FILL_RES;
      const H = Math.max(1, Math.round((FILL_RES * ch) / cw));
      const b64 = await captureRef(canvasRef, { result: 'base64', width: W, height: H, format: 'png', quality: 1 });

      const bytes = toByteArray(b64);
      const img = UPNG.decode(bytes.buffer);            // { width, height, ... }
      const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]); // always RGBA, 4 channels
      const iw = img.width, ih = img.height;

      const px = Math.min(iw - 1, Math.max(0, Math.floor((x / cw) * iw)));
      const py = Math.min(ih - 1, Math.max(0, Math.floor((y / ch) * ih)));
      const changed = floodFill(rgba, iw, ih, px, py, hexToRgb(color), TOLERANCE, 4);
      if (changed) {
        const out = UPNG.encode([rgba.buffer], iw, ih, 0); // 0 = lossless
        const uri = `data:image/png;base64,${fromByteArray(new Uint8Array(out))}`;
        setLayers((prev) => [...prev, { type: 'raster', uri }]);
      }
    } catch (e) {
      console.warn('flood fill failed:', e);
    } finally {
      setBusy(false);
    }
  };

  // Capture the canvas as a plain base64 PNG and hand it to the story flow.
  const useDoodle = async () => {
    if (saving || busy || isEmpty || !onDone) return;
    setSaving(true);
    try {
      const { width: cw, height: ch } = canvasSize.current;
      const W = EXPORT_RES;
      const H = Math.max(1, Math.round((EXPORT_RES * ch) / cw));
      const base64 = await captureRef(canvasRef, {
        result: 'base64',
        width: W,
        height: H,
        format: 'png',
        quality: 1,
      });
      onDone(base64, 'image/png');
    } catch (e) {
      console.warn('doodle export failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const drawGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => { runOnJS(startStroke)(e.x, e.y); })
    .onUpdate((e) => { runOnJS(pushPoint)(e.x, e.y); })
    .onEnd(() => { runOnJS(endStroke)(); });

  const fillGesture = Gesture.Tap()
    .maxDuration(2000)
    .onEnd((e) => { runOnJS(floodFillAt)(e.x, e.y); });

  const gesture = tool === 'fill' ? fillGesture : tool === 'page' ? Gesture.Tap() : drawGesture;

  const undo = () => setLayers((prev) => prev.slice(0, -1));
  const clear = () => { setLayers([]); setCurrentD(''); pointsRef.current = []; };

  const onSwatch = (c) => { if (tool === 'page') setBgColor(c); else setColor(c); };
  const activeColor = tool === 'page' ? bgColor : color;

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View
          ref={canvasRef}
          collapsable={false}
          style={[styles.canvasBox, { backgroundColor: bgColor }]}
          onLayout={(e) => { canvasSize.current = e.nativeEvent.layout; }}
        >
          {baseUri ? <Image source={{ uri: baseUri }} style={StyleSheet.absoluteFill} resizeMode="stretch" /> : null}
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            {topStrokes.map((s, i) => <Path key={i} d={s.d} fill={s.color} />)}
            {currentD ? <Path d={currentD} fill={color} /> : null}
          </Svg>
        </View>
      </GestureDetector>
    
     {busy || saving ? (
        <View style={styles.busy} pointerEvents="none">
          <ActivityIndicator size="large" />
          <Text style={styles.busyText}>{saving ? 'Getting your doodle ready…' : 'Filling…'}</Text>
        </View>
      ) : null}
      
      {/* Tools */}
      <View style={styles.toolRow}>
        {[['draw', 'Draw'], ['fill', 'Fill'], ['page', 'Page']].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTool(id)}
            activeOpacity={0.7}
            style={[styles.tool, tool === id && styles.toolSelected]}
          >
            <Text style={[styles.toolText, tool === id && styles.toolTextSelected]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Colors */}
      <View style={styles.swatchRow}>
        {COLORS.map((c) => {
          const selected = c === activeColor;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => onSwatch(c)}
              activeOpacity={0.7}
              style={[
                styles.swatch,
                { backgroundColor: c },
                c === '#ffffff' && styles.swatchWhite,
                selected && styles.swatchSelected,
              ]}
            />
          );
        })}
      </View>

      {/* Brush sizes + actions */}
      <View style={styles.sizeRow}>
        {SIZES.map((s, i) => {
          const selected = s === size;
          const dot = 10 + i * 8;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setSize(s)}
              activeOpacity={0.7}
              style={[styles.sizeBtn, selected && styles.sizeBtnSelected]}
            >
              <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color === '#ffffff' ? '#1a1a1a' : color }} />
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.btn} onPress={undo}><Text style={styles.btnText}>Undo</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={clear}><Text style={styles.btnText}>Clear</Text></TouchableOpacity>
      </View>

      {/* Done / Back — only shown when wired into the story flow */}
      {onDone ? (
        <View style={styles.doneRow}>
          {onCancel ? (
            <TouchableOpacity style={styles.backBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.doneBtn, (isEmpty || saving) && styles.doneDisabled]}
            onPress={useDoodle}
            disabled={isEmpty || saving}
          >
            <Text style={styles.doneText}>
              {saving ? '✨ Working…' : isEmpty ? 'Draw something first' : '✨ Use This Doodle'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, justifyContent: 'center' },
  canvasBox: { aspectRatio: 1, borderWidth: 2, borderColor: '#e0e0e0', borderRadius: 12, overflow: 'hidden' },

  busy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.4)' },
  busyText: { marginTop: 8, fontSize: 14, fontWeight: '600', color: '#333' },

  toolRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16 },
  tool: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10, backgroundColor: '#f0f0f0' },
  toolSelected: { backgroundColor: '#333' },
  toolText: { fontSize: 15, fontWeight: '700', color: '#333' },
  toolTextSelected: { color: '#fff' },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 14 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchWhite: { borderWidth: 1, borderColor: '#ccc' },
  swatchSelected: { borderWidth: 3, borderColor: '#333' },

  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  sizeBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  sizeBtnSelected: { backgroundColor: '#e0e0ff', borderWidth: 2, borderColor: '#8e8eff' },

  btn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#f0f0f0' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#333' },

  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 2, borderColor: '#F0E6D3', backgroundColor: '#fff' },
  backText: { fontSize: 15, fontWeight: '600', color: '#2D2D2D' },
  doneBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FF6B6B', alignItems: 'center' },
  doneDisabled: { opacity: 0.5 },
  doneText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});