import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * BARBER SHOP – RASCA Y GANA (3 FIGURAS)
 * --------------------------------------
 * React + Tailwind + <canvas> scratch mask con composición "destination-out".
 * Mecánica: hay 3 figuras ocultas. Rasca la tarjeta hasta descubrirlas; si las 3 coinciden → ganas.
 * - Anti-abuso: 1 juego cada 6 horas por dispositivo
 * - Cupón autogenerado + envío por WhatsApp
 * - Probabilidad configurable via pesos de símbolos
 */

// ====== CONFIG ======
const BRAND = { name: "Caballeros Barber Club", tagline: "Rasca 3 figuras iguales y gana" };
const PLAY_COOLDOWN_HOURS = 6;

const SYMBOLS = [
  { key: "scissors", label: "Tijeras", emoji: "✂️", weight: 28 },
  { key: "razor", label: "Navaja", emoji: "🪒", weight: 22 },
  { key: "pole", label: "Barber Pole", emoji: "💈", weight: 12 },
  { key: "beard", label: "Barba", emoji: "🧔", weight: 18 },
  { key: "product", label: "Cera", emoji: "🧴", weight: 12 },
  { key: "mirror", label: "Espejo", emoji: "🪞", weight: 8 },
];

const PRIZE_BY_SYMBOL: Record<string, { text: string; tier: "small" | "medium" | "big" }>
 = {
  scissors: { text: "10% de descuento en corte", tier: "small" },
  razor: { text: "10% de descuento en barba", tier: "small" },
  beard: { text: "Hot towel upgrade sin costo", tier: "medium" },
  product: { text: "Cera de peinado GRATIS (mini)", tier: "medium" },
  pole: { text: "2x1 en corte + barba (hoy)", tier: "big" },
  mirror: { text: "Peinado express sin costo", tier: "small" },
};

// ====== UTILS ======
const weightedPick = (arr: { weight: number }[]) => {
  const total = arr.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= arr[i].weight;
    if (r < 0) return i;
  }
  return arr.length - 1;
};
const digitsOnly = (v: string) => v.replace(/\D+/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const makeCoupon = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RSCA-${stamp}-${rand}`;
};
const saveLastPlay = () => localStorage.setItem("scratch_last_play", String(Date.now()));
const getLastPlay = () => Number(localStorage.getItem("scratch_last_play") || 0);
const hoursSince = (t: number) => (Date.now() - t) / (1000 * 60 * 60);

// ====== COMPONENT ======
export default function ScratchAndWin() {
  // Result/state
  const [symbols, setSymbols] = useState<{ key: string; emoji: string }[]>([]);
  const [revealedPct, setRevealedPct] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const [finished, setFinished] = useState(false);
  const [canPlay, setCanPlay] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  const [result, setResult] = useState<
    | null
    | {
        win: boolean;
        symbol?: string;
        prize?: { text: string; tier: "small" | "medium" | "big" };
        coupon?: string;
      }
  >(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const coverRef = useRef<HTMLImageElement | null>(null);
  const maskDrawnRef = useRef(false);

  // INIT symbols per play
  const newSymbols = () => {
    // Ensure reasonable chance to win: ~10-15% (tune by forcing triple occasionally)
    const i1 = weightedPick(SYMBOLS);
    const i2 = weightedPick(SYMBOLS);
    const i3 = Math.random() < 0.18 ? i1 : weightedPick(SYMBOLS); // small bias towards match
    setSymbols([SYMBOLS[i1], SYMBOLS[i2], SYMBOLS[i3]].map(({ key, emoji }) => ({ key, emoji })));
  };

  useEffect(() => {
    const last = getLastPlay();
    if (last) setCooldown(Math.max(0, PLAY_COOLDOWN_HOURS - hoursSince(last)));
    else setCooldown(0);
    newSymbols();
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      setCanPlay(false);
      const t = window.setInterval(() => {
        setCooldown((h) => Math.max(0, h - 1 / 60));
      }, 60 * 1000);
      return () => window.clearInterval(t);
    } else setCanPlay(true);
  }, [cooldown]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 560, h = 220; // drawing size
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;

    // Draw overlay coat
    drawOverlay();
    maskDrawnRef.current = true;
    setRevealedPct(0);
    setFinished(false);
    setResult(null);
  }, [symbols]);

  const drawOverlay = () => {
    const ctx = ctxRef.current; if (!ctx) return;
    const w = parseInt(canvasRef.current!.style.width);
    const h = parseInt(canvasRef.current!.style.height);
    // background gradient overlay
    const grd = ctx.createLinearGradient(0,0,w,h);
    grd.addColorStop(0, "#cbd5e1"); // slate-300
    grd.addColorStop(1, "#64748b"); // slate-500
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,w,h);
    // text
    ctx.fillStyle = "#0f172a"; // slate-900
    ctx.font = "bold 22px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Rasca aquí ✦", 20, 36);
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Descubre las 3 figuras. Si coinciden, ¡ganas!", 20, 62);

    // decorative strokes
    ctx.strokeStyle = "rgba(15,23,42,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1,1,w-2,h-2);
  };

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!terms || !canPlay || finished) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = ctxRef.current!;

    if (e.type === "pointerdown") {
      setIsScratching(true);
      canvas.setPointerCapture(e.pointerId);
    }
    if (e.type === "pointerup" || e.type === "pointercancel") {
      setIsScratching(false);
      canvas.releasePointerCapture(e.pointerId);
      checkRevealProgress();
      return;
    }
    if (e.type === "pointermove" && isScratching) {
      // Erase circles to reveal
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  };

  const checkRevealProgress = () => {
    const canvas = canvasRef.current!;
    const ctx = ctxRef.current!;
    const { width, height } = canvas;
    const data = ctx.getImageData(0,0,width,height).data;
    // Count transparent pixels (erased)
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
    }
    const pct = transparent / (width * height) * 100;
    setRevealedPct(pct);
    if (pct >= 60 && !finished) {
      // Finish and evaluate
      const win = symbols[0] && symbols.every((s) => s.key === symbols[0].key);
      if (win) {
        const p = PRIZE_BY_SYMBOL[symbols[0].key];
        const coupon = makeCoupon();
        setResult({ win: true, symbol: symbols[0].key, prize: p, coupon });
      } else {
        setResult({ win: false });
      }
      setFinished(true);
      saveLastPlay();
      setCooldown(PLAY_COOLDOWN_HOURS);
    }
  };

  const resetGame = () => {
    newSymbols();
  };

  const whatsappHref = useMemo(() => {
    if (!result?.coupon) return "#";
    const num = digitsOnly(phone);
    if (!num) return "#";
    const full = num.startsWith("52") ? num : `52${num}`; // MX by default
    const text = `Hola, quiero reclamar mi cupón ${result.coupon} de ${BRAND.name}. Mi nombre es ${name || "(sin nombre)"}.`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  }, [result, phone, name]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{BRAND.name}</h1>
          <p className="text-slate-300 mt-2">{BRAND.tagline}</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur rounded-3xl shadow-2xl border border-slate-700 overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-indigo-500/20 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-100">
              <span className="text-3xl">💈</span>
              <span className="uppercase tracking-widest font-semibold">Rasca y Gana</span>
              <span className="text-3xl">✂️</span>
            </div>
          </div>

          <div className="p-6 md:p-8">
            {/* Under-card with 3 symbols */}
            <div className="relative mx-auto w-[560px] max-w-full">
              <div className="grid grid-cols-3 gap-3 bg-slate-900/70 border border-slate-700 rounded-2xl p-4">
                {symbols.map((s, i) => (
                  <div key={i} className="aspect-square flex items-center justify-center rounded-xl bg-slate-900 text-6xl md:text-7xl">
                    <span>{s.emoji}</span>
                  </div>
                ))}
              </div>

              {/* Scratch overlay canvas */}
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointer}
                onPointerMove={handlePointer}
                onPointerUp={handlePointer}
                onPointerCancel={handlePointer}
                className="absolute inset-0 rounded-2xl cursor-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\"><circle cx=\"16\" cy=\"16\" r=\"8\" fill=\"%23ffffff\"/></svg>')]"
                style={{ touchAction: "none" }}
              />
            </div>

            {/* Status + Controls */}
            <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-slate-300 text-sm">
                {cooldown > 0 ? (
                  <>Próximo intento en {Math.ceil(cooldown)}h.</>
                ) : (
                  <>Rasca con tu dedo; cuando reveles ~60% evaluaremos tu premio.</>
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
                  onClick={resetGame}
                  disabled={!terms || cooldown > 0}
                  className={`px-5 py-2 rounded-xl font-semibold border transition ${
                    terms && cooldown <= 0
                      ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
                      : "bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed"
                  }`}
                >
                  {cooldown > 0 ? "Esperando…" : "Nueva tarjeta"}
                </button>
              </div>
            </div>

            {/* Result banner */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`mt-6 rounded-2xl p-4 border text-center ${
                    result.win && result.prize?.tier === "big"
                      ? "bg-emerald-500/15 border-emerald-400 text-emerald-200"
                      : result.win && result.prize?.tier === "medium"
                      ? "bg-indigo-500/15 border-indigo-400 text-indigo-200"
                      : result.win
                      ? "bg-amber-500/15 border-amber-400 text-amber-200"
                      : "bg-slate-700/40 border-slate-600 text-slate-200"
                  }`}
                >
                  <div className="text-lg md:text-xl font-bold">
                    {result.win ? "¡Felicidades!" : "¡Sigue participando!"}
                  </div>
                  <div className="mt-1">
                    {result.win
                      ? PRIZE_BY_SYMBOL[result.symbol!].text
                      : "Inténtalo de nuevo en tu próxima visita"}
                  </div>
                  {result.coupon && (
                    <div className="mt-2 text-sm text-slate-300">
                      Cupón: <span className="font-mono text-white">{result.coupon}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Claim form */}
            {result?.win && result.coupon && (
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
                  *Se abrirá WhatsApp con tu cupón para validarlo con {BRAND.name}.
                </p>
              </motion.div>
            )}

            <div className="mt-8 text-[11px] leading-5 text-slate-400">
              <p>
                Dinámica: rasca para revelar ~60% de la tarjeta. Si las 3 figuras coinciden → premio
                según el símbolo (ver tabla interna). Un juego cada {PLAY_COOLDOWN_HOURS} horas por dispositivo.
                Sujeto a disponibilidad. No canjeable por efectivo.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} {BRAND.name}. Demo Rasca y Gana.
        </div>
      </div>
    </div>
  );
}
