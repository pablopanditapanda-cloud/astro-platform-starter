import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * BARBER SHOP PLINKO – Single‑file React component
 * -------------------------------------------------
 * - TailwindCSS for styling
 * - Framer Motion for animations
 * - Lightweight Plinko logic: the ball advances row by row (random L/R),
 *   final column defines prize tier. Visualization uses a peg grid + slots.
 * - WhatsApp claim flow + cooldown to avoid abuso.
 *
 * Usage:
 *  - Drop into a React/Next.js project that already has Tailwind + Framer Motion.
 *  - Render <PlinkoBarber /> as a page or inside your app.
 */

// ===== CONFIG =====
const BRAND = {
  name: "Caballeros Barber Club",
  tagline: "Deja caer la ficha y gana",
};

// Number of rows of pegs. Columns will be rows + 1 at the bottom
const ROWS = 10; // visual + gameplay sweet spot

// Prize slots (from left to right). Map to tiers.
// You can tune probability shape by moving the BIG/SMALL positions.
const SLOT_PRIZES: { label: string; tier: "miss" | "small" | "medium" | "big" }[] = [
  { label: "Sigue", tier: "miss" },
  { label: "10% Corte", tier: "small" },
  { label: "Toalla Caliente", tier: "small" },
  { label: "Cera Mini", tier: "medium" },
  { label: "2x1 Corte+Barba", tier: "big" },
  { label: "Cera Mini", tier: "medium" },
  { label: "Toalla Caliente", tier: "small" },
  { label: "10% Corte", tier: "small" },
  { label: "Sigue", tier: "miss" },
  { label: "Sigue", tier: "miss" },
  { label: "10% Corte", tier: "small" },
];

const PLAY_COOLDOWN_HOURS = 6;

// ===== UTILS =====
const digitsOnly = (v: string) => v.replace(/\D+/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const makeCoupon = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PLNK-${stamp}-${rand}`;
};
const saveLastPlay = () => localStorage.setItem("plinko_last_play", String(Date.now()));
const getLastPlay = () => Number(localStorage.getItem("plinko_last_play") || 0);
const hoursSince = (t: number) => (Date.now() - t) / (1000 * 60 * 60);

// Build peg grid positions for layout
function usePegLayout(width = 11) {
  // Width = number of columns at the base (rows + 1). We'll use SLOT_PRIZES.length.
  const cols = width;
  const rows = ROWS;
  const pegs: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const y = r; // logical row
    const rowCols = cols - 1; // pegs are between slots
    for (let c = 0; c < rowCols; c++) {
      // offset every other row by 0.5 to visualize the Plinko staggering
      const offset = r % 2 === 0 ? 0.5 : 0;
      const x = c + offset;
      pegs.push({ x, y });
    }
  }
  return { cols, rows, pegs };
}

// Simulate a path through ROWS decisions (Left / Right). Starting at middle column.
function simulatePath(slotsCount: number) {
  const steps: ("L" | "R")[] = [];
  for (let i = 0; i < ROWS; i++) {
    steps.push(Math.random() < 0.5 ? "L" : "R");
  }
  // start column (index into slots)
  let col = Math.floor(slotsCount / 2);
  steps.forEach((s) => {
    col += s === "R" ? 1 : -1;
    col = Math.max(0, Math.min(slotsCount - 1, col));
  });
  return { steps, finalCol: col };
}

// ===== COMPONENT =====
export default function PlinkoBarber() {
  const { cols, pegs } = usePegLayout(SLOT_PRIZES.length);
  const [terms, setTerms] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [path, setPath] = useState<{ steps: ("L" | "R")[]; finalCol: number } | null>(
    null
  );
  const [rowIndex, setRowIndex] = useState(0);
  const [ballX, setBallX] = useState(Math.floor(cols / 2));
  const [result, setResult] = useState<
    | null
    | {
        col: number;
        prize: { label: string; tier: "miss" | "small" | "medium" | "big" };
        coupon?: string;
      }
  >(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const last = getLastPlay();
    if (last) setCooldown(Math.max(0, PLAY_COOLDOWN_HOURS - hoursSince(last)));
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const t = window.setInterval(() => {
        setCooldown((h) => Math.max(0, h - 1 / 60));
      }, 60 * 1000);
      return () => window.clearInterval(t);
    }
  }, [cooldown]);

  const canDrop = terms && cooldown <= 0 && !dropping;

  const onDrop = () => {
    if (!canDrop) return;
    const p = simulatePath(cols);
    setPath(p);
    setBallX(Math.floor(cols / 2));
    setRowIndex(0);
    setResult(null);
    setDropping(true);
  };

  // Animate row-by-row descent
  useEffect(() => {
    if (!dropping || !path) return;
    if (rowIndex >= ROWS) {
      const col = path.finalCol;
      const prize = SLOT_PRIZES[col];
      const coupon = prize.tier === "miss" ? undefined : makeCoupon();
      setResult({ col, prize, coupon });
      setDropping(false);
      saveLastPlay();
      setCooldown(PLAY_COOLDOWN_HOURS);
      return;
    }
    const t = window.setTimeout(() => {
      // update position depending on this step
      const step = path.steps[rowIndex];
      setBallX((x) => {
        const nx = step === "R" ? x + 1 : x - 1;
        return Math.max(0, Math.min(cols - 1, nx));
      });
      setRowIndex((i) => i + 1);
    }, 220); // rhythm between pegs
    return () => window.clearTimeout(t);
  }, [dropping, path, rowIndex, cols]);

  const whatsappHref = useMemo(() => {
    if (!result?.coupon) return "#";
    const num = digitsOnly(phone);
    if (!num) return "#";
    const full = num.startsWith("52") ? num : `52${num}`;
    const text = `Hola, quiero reclamar mi cupón ${result.coupon} del juego Plinko de ${BRAND.name}. Mi nombre es ${name ||
      "(sin nombre)"}.`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  }, [result, phone, name]);

  // Layout constants
  const CELL = 28; // px grid size
  const BOARD_W = cols * CELL;
  const BOARD_H = (ROWS + 4) * CELL; // extra space for header/footer

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold">{BRAND.name}</h1>
          <p className="text-slate-300 mt-2">{BRAND.tagline}</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
          {/* Header banner */}
          <div className="h-20 bg-gradient-to-r from-emerald-500/20 via-amber-500/20 to-red-500/20 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-100">
              <span className="text-3xl">💈</span>
              <span className="uppercase tracking-widest font-semibold">Plinko de la Barber</span>
              <span className="text-3xl">✂️</span>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {/* Board */}
            <div className="mx-auto" style={{ width: BOARD_W }}>
              <div
                className="relative bg-slate-900/70 border border-slate-700 rounded-2xl overflow-hidden"
                style={{ width: BOARD_W, height: BOARD_H }}
              >
                {/* Pegs */}
                {pegs.map((p, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-slate-400/70"
                    style={{
                      left: p.x * CELL + CELL / 2 - 4,
                      top: (p.y + 1) * CELL + CELL / 2 - 4,
                    }}
                  />
                ))}

                {/* Slots labels */}
                {SLOT_PRIZES.map((s, i) => (
                  <div
                    key={`slot-${i}`}
                    className={`absolute bottom-0 text-[10px] px-1 py-1 text-center border-t border-slate-700 ${
                      s.tier === "big"
                        ? "bg-emerald-500/25 text-emerald-200"
                        : s.tier === "medium"
                        ? "bg-indigo-500/20 text-indigo-200"
                        : s.tier === "small"
                        ? "bg-amber-500/20 text-amber-200"
                        : "bg-slate-700/30 text-slate-300"
                    }`}
                    style={{ left: i * CELL, width: CELL, height: CELL * 2 }}
                  >
                    <div className="leading-3 mt-1">{s.label}</div>
                  </div>
                ))}

                {/* Ball */}
                <AnimatePresence>
                  {dropping && (
                    <motion.div
                      key="ball"
                      initial={{ y: 0, x: Math.floor(cols / 2) * CELL + CELL / 2 - 6, opacity: 0 }}
                      animate={{
                        y: rowIndex * CELL + CELL, // descend stepwise
                        x: ballX * CELL + CELL / 2 - 6,
                        opacity: 1,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="absolute w-3 h-3 rounded-full bg-white shadow-lg"
                    />
                  )}
                </AnimatePresence>

                {/* Guide triangle (start position) */}
                {!dropping && !result && (
                  <div
                    className="absolute text-slate-400 text-xs"
                    style={{ left: Math.floor(cols / 2) * CELL - 4, top: 2 }}
                  >
                    ▼
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-slate-300 text-sm">
                  {cooldown > 0 ? (
                    <>Próxima ficha disponible en {Math.ceil(cooldown)}h.</>
                  ) : (
                    <>Marca la casilla y presiona <strong>Soltar ficha</strong>.</>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-slate-300 text-sm">
                    <input
                      type="checkbox"
                      checked={terms}
                      onChange={(e) => setTerms(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                    />
                    Acepto Términos y uso de datos para el premio
                  </label>
                  <button
                    onClick={onDrop}
                    disabled={!canDrop}
                    className={`px-5 py-2 rounded-xl font-semibold border transition active:scale-95 ${
                      canDrop
                        ? "bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400"
                        : "bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {dropping ? "Jugando…" : "Soltar ficha"}
                  </button>
                </div>
              </div>

              {/* Result */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`mt-4 rounded-2xl p-4 text-center border ${
                      result.prize.tier === "big"
                        ? "bg-emerald-500/15 border-emerald-400 text-emerald-200"
                        : result.prize.tier === "medium"
                        ? "bg-indigo-500/15 border-indigo-400 text-indigo-200"
                        : result.prize.tier === "small"
                        ? "bg-amber-500/15 border-amber-400 text-amber-200"
                        : "bg-slate-700/40 border-slate-600 text-slate-200"
                    }`}
                  >
                    <div className="text-lg md:text-xl font-bold">
                      {result.prize.tier === "miss" ? "¡Sigue participando!" : "¡Ganaste!"}
                    </div>
                    <div className="mt-1">{result.prize.label}</div>
                    {result.coupon && (
                      <div className="mt-2 text-sm text-slate-300">
                        Cupón: <span className="font-mono text-white">{result.coupon}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Claim form */}
              {result && result.prize.tier !== "miss" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 grid md:grid-cols-3 gap-3"
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Tu WhatsApp (10 dígitos MX)"
                    inputMode="numeric"
                    className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-center px-4 py-3 rounded-xl font-semibold border transition ${
                      result?.coupon && digitsOnly(phone).length >= 10
                        ? "bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400"
                        : "bg-slate-700 text-slate-400 border-slate-600 pointer-events-none"
                    }`}
                  >
                    Enviar cupón por WhatsApp
                  </a>
                  <p className="md:col-span-3 text-xs text-slate-400">
                    *Se abrirá WhatsApp con tu cupón y nombre para validarlo con {BRAND.name}.
                  </p>
                </motion.div>
              )}

              <div className="mt-6 text-[11px] text-slate-400">
                Probabilidades: la ficha toma decisiones aleatorias izquierda/derecha en cada fila.
                La distribución favorece el centro. Un intento cada {PLAY_COOLDOWN_HOURS} horas por dispositivo.
                Sujeto a disponibilidad. No canjeable por efectivo.
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} {BRAND.name}. Demo Plinko.
        </div>
      </div>
    </div>
  );
}
