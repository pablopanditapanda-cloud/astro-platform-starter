import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * BARBER SHOP SLOT GAME – Single‑file React component
 * ---------------------------------------------------
 * - TailwindCSS classes for styling (no external UI libs required)
 * - Framer Motion for smooth animations
 * - Phone capture + WhatsApp deep link to send the coupon
 * - Basic anti‑abuse: 1 spin per 6 hours (configurable)
 * - Weighted odds + simple prize mapping
 *
 * How to use:
 *   1) Drop this component in a Next.js/React app. Tailwind + Framer Motion must be available.
 *   2) Set <SlotBarber /> as a page or render inside your layout.
 *   3) Customize BRAND, PRIZES, and ODDS at the constants section.
 */

// ======== CONFIG ========
const BRAND = {
  name: "Caballeros Barber Club",
  tagline: "Escanea, juega y gana",
  primary: "#111827", // slate-900
  accent: "#f59e0b", // amber-500
  accent2: "#22c55e", // green-500
};

const SYMBOLS = [
  { key: "scissors", label: "Tijeras", emoji: "✂️", weight: 22 },
  { key: "razor", label: "Navaja", emoji: "🪒", weight: 18 },
  { key: "pole", label: "Barber Pole (Wild)", emoji: "💈", weight: 12 },
  { key: "beard", label: "Barba", emoji: "🧔", weight: 16 },
  { key: "cut", label: "Corte", emoji: "💇‍♂️", weight: 16 },
  { key: "product", label: "Producto", emoji: "🧴", weight: 10 },
  { key: "mirror", label: "Espejo", emoji: "🪞", weight: 6 },
];

const PRIZES = [
  { id: "p10", text: "10% de descuento en corte", tier: "small" },
  { id: "p20", text: "20% de descuento en barba", tier: "small" },
  { id: "wax", text: "Cera de peinado GRATIS (mini)", tier: "medium" },
  { id: "2x1", text: "2x1 en corte + barba (mismo día)", tier: "big" },
  { id: "hb", text: "Hot towel upgrade sin costo", tier: "small" },
  { id: "miss", text: "Sigue participando", tier: "miss" },
];

const PLAY_COOLDOWN_HOURS = 6; // tiempo entre giros por dispositivo

// ======== UTILS ========
const randomWeightedIndex = (weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
};

const digitsOnly = (v) => v.replace(/\D+/g, "");

const makeCoupon = () => {
  const y = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${y.getFullYear()}${pad(y.getMonth() + 1)}${pad(y.getDate())}-${pad(
    y.getHours()
  )}${pad(y.getMinutes())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BARB-${stamp}-${rand}`;
};

const saveLastPlay = () => localStorage.setItem("slot_last_play", String(Date.now()));
const getLastPlay = () => Number(localStorage.getItem("slot_last_play") || 0);

const hoursSince = (t) => (Date.now() - t) / (1000 * 60 * 60);

// Map resultado (3 iguales, 2 + wild, etc.) a tiers de premio
function evaluateResult(a, b, c) {
  // Exact match 3
  if (a.key === b.key && b.key === c.key) {
    // triple wild = medium (evitar premio exagerado con wild), resto = big
    return a.key === "pole" ? "medium" : "big";
  }
  // Dos iguales + wild
  const arr = [a.key, b.key, c.key];
  const hasWild = arr.includes("pole");
  const counts = arr.reduce((acc, k) => ((acc[k] = (acc[k] || 0) + 1), acc), {});
  const hasPair = Object.values(counts).some((v) => v === 2);
  if (hasWild && hasPair) return "medium";

  // Cualquier pair (sin wild)
  if (hasPair) return "small";

  return "miss";
}

function pickPrizeByTier(tier) {
  const options = PRIZES.filter((p) => p.tier === tier);
  if (!options.length) return PRIZES.find((p) => p.tier === "miss")!;
  return options[Math.floor(Math.random() * options.length)];
}

// ======== COMPONENT ========
export default function SlotBarber() {
  const [reels, setReels] = useState([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null as null | {
    tier: "small" | "medium" | "big" | "miss";
    prize: { id: string; text: string; tier: string } | null;
    coupon?: string;
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const symbolWeights = useMemo(() => SYMBOLS.map((s) => s.weight), []);
  const spinTimers = useRef<number[]>([]);

  useEffect(() => {
    const last = getLastPlay();
    if (last) {
      const h = Math.max(0, PLAY_COOLDOWN_HOURS - hoursSince(last));
      setCooldown(h);
    }
  }, []);

  useEffect(() => {
    if (!spinning) return;
    // fake spinning by quickly changing indices, then settle one by one
    const durations = [1300, 2000, 2600];
    const intervals: number[] = [];
    const starts = [0, 0, 0].map((_, i) => (intervals[i] = window.setInterval(() => {
      setReels((r) => {
        const copy = [...r];
        copy[i] = (copy[i] + 1) % SYMBOLS.length;
        return copy;
      });
    }, 55 + i * 15)));

    // final values using weighted randomness
    const finalIdx = [0, 1, 2].map(() => randomWeightedIndex(symbolWeights));

    durations.forEach((d, i) => {
      spinTimers.current[i] = window.setTimeout(() => {
        intervals.forEach((iv, k) => {
          if (k === i && iv) window.clearInterval(iv);
        });
        setReels((r) => {
          const copy = [...r];
          copy[i] = finalIdx[i];
          return copy;
        });
        if (i === 2) {
          // finished all reels
          window.setTimeout(() => {
            const a = SYMBOLS[finalIdx[0]];
            const b = SYMBOLS[finalIdx[1]];
            const c = SYMBOLS[finalIdx[2]];
            const tier = evaluateResult(a, b, c);
            const prize = pickPrizeByTier(tier);
            const coupon = tier === "miss" ? undefined : makeCoupon();
            setResult({ tier, prize: prize || null, coupon });
            saveLastPlay();
            setCooldown(PLAY_COOLDOWN_HOURS);
            setSpinning(false);
          }, 200);
        }
      }, d);
    });

    return () => {
      intervals.forEach((iv) => window.clearInterval(iv));
      spinTimers.current.forEach((t) => window.clearTimeout(t));
    };
  }, [spinning, symbolWeights]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = window.setInterval(() => {
        setCooldown((h) => Math.max(0, h - 1 / 60)); // approx minutes resolution
      }, 60 * 1000);
      return () => window.clearInterval(t);
    }
  }, [cooldown]);

  const canSpin = !spinning && cooldown <= 0 && terms;

  const onSpin = () => {
    setResult(null);
    setSpinning(true);
  };

  const whatsappHref = useMemo(() => {
    if (!result?.coupon) return "#";
    const num = digitsOnly(phone);
    if (!num) return "#";
    const full = num.startsWith("52") ? num : `52${num}`; // MX default
    const text = `Hola, quiero reclamar mi cupón ${result.coupon} de ${BRAND.name}. Mi nombre es ${name || "(sin nombre)"}.`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  }, [result, phone, name]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header / Branding */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {BRAND.name}
          </h1>
          <p className="text-slate-300 mt-2">{BRAND.tagline}</p>
        </div>

        {/* Game Card */}
        <div className="bg-slate-800/60 backdrop-blur rounded-3xl shadow-2xl border border-slate-700 overflow-hidden">
          {/* Top banner */}
          <div className="relative h-24 flex items-center justify-center bg-gradient-to-r from-amber-500/30 via-amber-500/20 to-amber-500/30">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 text-amber-300"
            >
              <span className="text-3xl">💈</span>
              <span className="text-xl font-semibold uppercase tracking-widest">
                Slot de la Barber
              </span>
              <span className="text-3xl">✂️</span>
            </motion.div>
          </div>

          {/* Reels */}
          <div className="p-6 md:p-8">
            <div className="grid grid-cols-3 gap-3 md:gap-5">
              {reels.map((idx, i) => (
                <div
                  key={i}
                  className="relative bg-slate-900/70 rounded-2xl border border-slate-700 h-40 md:h-48 overflow-hidden flex items-center justify-center"
                >
                  <motion.div
                    key={spinning ? `spin-${i}` : `stop-${i}`}
                    animate={{ rotateX: spinning ? 360 * 4 : 0 }}
                    transition={{ duration: spinning ? 1 + i * 0.2 : 0.3, ease: "easeOut" }}
                    className="text-6xl md:text-7xl select-none"
                  >
                    {SYMBOLS[idx].emoji}
                  </motion.div>
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/40" />
                </div>
              ))}
            </div>

            {/* Status / CTA */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-slate-300 text-sm md:text-base">
                {cooldown > 0 ? (
                  <span>
                    Próximo giro disponible en {Math.ceil(cooldown)}h. ¡Vuelve pronto!
                  </span>
                ) : (
                  <span>
                    Marca la casilla y presiona <strong>Girar</strong> para jugar.
                  </span>
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
                  Acepto Términos y Uso de datos para el premio
                </label>
                <button
                  onClick={onSpin}
                  disabled={!canSpin}
                  className={`px-5 py-2 rounded-xl font-semibold transition border active:scale-95 ${
                    canSpin
                      ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
                      : "bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed"
                  }`}
                >
                  {spinning ? "Girando…" : "Girar"}
                </button>
              </div>
            </div>

            {/* Result Banner */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`mt-6 rounded-2xl p-4 border text-center ${
                    result.tier === "big"
                      ? "bg-emerald-500/15 border-emerald-400 text-emerald-200"
                      : result.tier === "medium"
                      ? "bg-indigo-500/15 border-indigo-400 text-indigo-200"
                      : result.tier === "small"
                      ? "bg-amber-500/15 border-amber-400 text-amber-200"
                      : "bg-slate-700/40 border-slate-600 text-slate-200"
                  }`}
                >
                  <div className="text-lg md:text-xl font-bold">
                    {result.tier === "miss" ? "¡Sigue participando!" : "¡Felicidades!"}
                  </div>
                  <div className="mt-1">
                    {result.prize?.text || "Gracias por jugar"}
                  </div>
                  {result.coupon && (
                    <div className="mt-2 text-sm text-slate-300">
                      Código de cupón: <span className="font-mono text-white">{result.coupon}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Claim form */}
            {result && result.tier !== "miss" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 grid md:grid-cols-3 gap-3"
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-400"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Tu WhatsApp (10 dígitos MX)"
                  inputMode="numeric"
                  className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex gap-3">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex-1 text-center px-4 py-3 rounded-xl font-semibold border transition ${
                      result?.coupon && digitsOnly(phone).length >= 10
                        ? "bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400"
                        : "bg-slate-700 text-slate-400 border-slate-600 pointer-events-none"
                    }`}
                  >
                    Enviar cupón por WhatsApp
                  </a>
                </div>
                <p className="md:col-span-3 text-xs text-slate-400">
                  *Al presionar el botón se abrirá WhatsApp con tu cupón y tu nombre para que el equipo de {BRAND.name} lo valide.
                </p>
              </motion.div>
            )}

            {/* Legal / odds */}
            <div className="mt-8 text-[11px] leading-5 text-slate-400">
              <p>
                Probabilidades y dinámica: los símbolos tienen pesos distintos. Premios por tres
                iguales (excepto wild) → <strong>premio grande</strong>; dos iguales + wild →
                <strong>premio medio</strong>; dos iguales → <strong>premio pequeño</strong>.
                Un giro cada {PLAY_COOLDOWN_HOURS} horas por dispositivo. Sujeto a disponibilidad. No canjeable por efectivo.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} {BRAND.name}. Hecho para demostración.
        </div>
      </div>
    </div>
  );
}
