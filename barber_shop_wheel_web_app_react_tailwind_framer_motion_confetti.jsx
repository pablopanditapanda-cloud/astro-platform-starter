import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

/**
 * BARBER SHOP – WHEEL OF PRIZES (CONFETTI EDITION)
 * -------------------------------------------------
 * - Vistosa ruleta con 10 secciones y colores alternados
 * - Spin animado con easing realista + pointer superior
 * - Resultado con tiers (small/medium/big/miss)
 * - Confetti cuando hay premio (no en "miss")
 * - Cupón autogenerado + envío por WhatsApp
 * - Cooldown (1 intento cada 6h) y consentimiento
 *
 * Requisitos: Tailwind + Framer Motion + canvas-confetti
 */

// ===== CONFIG =====
const BRAND = {
  name: "Caballeros Barber Club",
  tagline: "Gira la ruleta y gana",
};

const SECTORS: { label: string; tier: "miss" | "small" | "medium" | "big" }[] = [
  { label: "Sigue", tier: "miss" },
  { label: "10% Corte", tier: "small" },
  { label: "Toalla Caliente", tier: "small" },
  { label: "Cera Mini", tier: "medium" },
  { label: "2x1 Corte+Barba", tier: "big" },
  { label: "Cera Mini", tier: "medium" },
  { label: "10% Barba", tier: "small" },
  { label: "Peinado Express", tier: "small" },
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
  return `WHEL-${stamp}-${rand}`;
};
const saveLastPlay = () => localStorage.setItem("wheel_last_play", String(Date.now()));
const getLastPlay = () => Number(localStorage.getItem("wheel_last_play") || 0);
const hoursSince = (t: number) => (Date.now() - t) / (1000 * 60 * 60);

function spinToIndex(count: number) {
  // Choose an index with a slight bias hacia premios pequeños
  const weights = Array.from({ length: count }, (_, i) => {
    const tier = SECTORS[i].tier;
    if (tier === "big") return 1;
    if (tier === "medium") return 2;
    if (tier === "small") return 4;
    return 3; // miss
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < count; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return 0;
}

// ===== COMPONENT =====
export default function WheelBarber() {
  const [terms, setTerms] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0); // degrees
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [result, setResult] = useState<
    | null
    | {
        index: number;
        sector: { label: string; tier: "miss" | "small" | "medium" | "big" };
        coupon?: string;
      }
  >(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const sectorCount = SECTORS.length;
  const stepAngle = 360 / sectorCount;

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

  const canSpin = terms && cooldown <= 0 && !spinning;

  const onSpin = () => {
    if (!canSpin) return;
    setResult(null);
    setSpinning(true);

    const index = spinToIndex(sectorCount);
    setTargetIndex(index);

    // compute target angle so that pointer (top) lands on index
    const baseTurns = 5; // full spins antes de llegar
    const pointerOffset = -90; // pointer en la parte superior
    const finalAngle = baseTurns * 360 + (index * stepAngle + stepAngle / 2) + pointerOffset + (Math.random() * 6 - 3);

    const duration = 3.5; // seconds
    const start = performance.now();
    const startAngle = angle % 360;
    const delta = finalAngle - startAngle + (startAngle > finalAngle ? 360 : 0);

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    function animate(now: number) {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = easeOutCubic(t);
      const current = startAngle + delta * eased;
      setAngle(current);
      if (t < 1) requestAnimationFrame(animate);
      else {
        // settle
        const landedIndex = Math.floor(((current - pointerOffset) % 360) / stepAngle) % sectorCount;
        const sector = SECTORS[landedIndex];
        const coupon = sector.tier === "miss" ? undefined : makeCoupon();
        setResult({ index: landedIndex, sector, coupon });
        saveLastPlay();
        setCooldown(PLAY_COOLDOWN_HOURS);
        setSpinning(false);
        if (sector.tier !== "miss") burstConfetti();
      }
    }

    requestAnimationFrame(animate);
  };

  const burstConfetti = () => {
    const opts = { particleCount: 120, spread: 70, origin: { y: 0.25 } } as const;
    confetti(opts);
    setTimeout(() => confetti({ ...opts, particleCount: 80, angle: 60, origin: { x: 0 }, spread: 55 }), 150);
    setTimeout(() => confetti({ ...opts, particleCount: 80, angle: 120, origin: { x: 1 }, spread: 55 }), 300);
  };

  const whatsappHref = useMemo(() => {
    if (!result?.coupon) return "#";
    const num = digitsOnly(phone);
    if (!num) return "#";
    const full = num.startsWith("52") ? num : `52${num}`;
    const text = `Hola, quiero reclamar mi cupón ${result.coupon} del juego Ruleta de ${BRAND.name}. Mi nombre es ${name ||
      "(sin nombre)"}.`;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  }, [result, phone, name]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold">{BRAND.name}</h1>
          <p className="text-slate-300 mt-2">{BRAND.tagline}</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-indigo-500/20 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-100">
              <span className="text-3xl">💈</span>
              <span className="uppercase tracking-widest font-semibold">Ruleta de Premios</span>
              <span className="text-3xl">✂️</span>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              {/* Wheel */}
              <div className="relative mx-auto md:mx-0">
                {/* Pointer */}
                <div className="absolute left-1/2 -top-3 -translate-x-1/2 z-10">
                  <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-amber-400 drop-shadow"/>
                </div>

                <motion.div
                  className="relative rounded-full bg-slate-900 border-4 border-slate-700 shadow-2xl"
                  style={{ width: 320, height: 320 }}
                  animate={{ rotate: angle }}
                  transition={{ type: "tween" }}
                >
                  {SECTORS.map((s, i) => {
                    const rotation = i * stepAngle;
                    const color = s.tier === "big"
                      ? "bg-emerald-500/25"
                      : s.tier === "medium"
                      ? "bg-indigo-500/25"
                      : s.tier === "small"
                      ? "bg-amber-500/25"
                      : "bg-slate-600/25";
                    return (
                      <div
                        key={i}
                        className={`absolute inset-2 rounded-full ${color}`}
                        style={{
                          clipPath: `polygon(50% 50%, 100% 0, 100% 100%)`,
                          transform: `rotate(${rotation}deg)`,
                          transformOrigin: "50% 50%",
                        }}
                      >
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[82%] text-[11px] font-semibold tracking-tight text-center w-24 text-slate-100"
                          style={{ transform: `rotate(${-rotation}deg)` }}
                        >
                          {s.label}
                        </div>
                      </div>
                    );
                  })}

                  {/* Center hub */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center shadow-inner">
                      <span className="text-3xl">💈</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Controls / Right side */}
              <div className="flex-1">
                <div className="text-slate-300 text-sm">
                  {cooldown > 0 ? (
                    <>Próximo giro disponible en {Math.ceil(cooldown)}h.</>
                  ) : (
                    <>Marca la casilla y presiona <strong>Girar</strong>.</>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3">
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
                    onClick={onSpin}
                    disabled={!canSpin}
                    className={`px-5 py-2 rounded-xl font-semibold border transition active:scale-95 ${
                      canSpin
                        ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
                        : "bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {spinning ? "Girando…" : "Girar"}
                  </button>
                </div>

                {/* Result */}
                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={`mt-5 rounded-2xl p-4 text-center border ${
                        result.sector.tier === "big"
                          ? "bg-emerald-500/15 border-emerald-400 text-emerald-200"
                          : result.sector.tier === "medium"
                          ? "bg-indigo-500/15 border-indigo-400 text-indigo-200"
                          : result.sector.tier === "small"
                          ? "bg-amber-500/15 border-amber-400 text-amber-200"
                          : "bg-slate-700/40 border-slate-600 text-slate-200"
                      }`}
                    >
                      <div className="text-lg md:text-xl font-bold">
                        {result.sector.tier === "miss" ? "¡Sigue participando!" : "¡Felicidades!"}
                      </div>
                      <div className="mt-1">{result.sector.label}</div>
                      {result.coupon && (
                        <div className="mt-2 text-sm text-slate-300">
                          Cupón: <span className="font-mono text-white">{result.coupon}</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Claim form */}
                {result?.coupon && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 grid md:grid-cols-3 gap-3"
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
                      *Se abrirá WhatsApp con tu cupón y nombre para validarlo con {BRAND.name}.
                    </p>
                  </motion.div>
                )}

                <div className="mt-6 text-[11px] text-slate-400">
                  Un giro cada {PLAY_COOLDOWN_HOURS} horas por dispositivo. Sujetos a disponibilidad. No canjeable por efectivo.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} {BRAND.name}. Demo Ruleta con confetti.
        </div>
      </div>
    </div>
  );
}
