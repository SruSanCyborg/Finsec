"use client";

// Sirius landing — structure & animations from Untitled-1.html (glassmorphic
// 2-column panels with a right-side 3D model per section), rethemed to the
// app's blue/cyan palette, with Clerk auth (sign-in / console) and the CLI
// entry points. Webcam consent drives the star's energy (camera feature).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "@/lib/providers";
import { DEMO_CREDENTIALS } from "@/lib/constants";
import { api } from "@/lib/mock/api";
import { setSessionCookie } from "@/lib/mock/api";
import styles from "./sirius-landing.module.css";

const ModelStage = dynamic(() => import("./ModelStage"), {
  ssr: false,
  loading: () => null,
});

const WebcamPixels = dynamic(() => import("./WebcamPixels"), {
  ssr: false,
  loading: () => null,
});

// ── data (from index1/Untitled-1 panels) ──────────────────────────────────────

const STAGES = [
  { n: "01", name: "identity", q: "Is this agent allowed to do this at all?", ex: "withdraw is outside this agent’s grant" },
  { n: "02", name: "intent", q: "Does its stated purpose match its objective?", ex: "stated purpose does not match the agent’s objective" },
  { n: "03", name: "policy", q: "Spending, exposure, frequency, counterparty.", ex: "₹82,000 is over the per-action cap" },
  { n: "04", name: "context", q: "Counterparty reputation, protocol risk, flags.", ex: "yield-max is unaudited" },
  { n: "05", name: "behaviour", q: "Is this how this agent actually behaves?", ex: "₹49,500 is 2.1σ above this agent’s usual" },
  { n: "06", name: "manipulation", q: "Can the instruction behind it be trusted?", ex: "the instruction contains override of prior instructions" },
];

const FEED = [
  { v: "BLOCK", cls: "lBlock", text: "wlt-9f2c41    ₹48,000   the instruction contains override of prior instructions" },
  { v: "CONSTRAIN", cls: "lConstrain", text: "delta-logi..  ₹82,000 -> ₹50,000   over the per-action cap" },
  { v: "VERIFY", cls: "lVerify", text: "northwind..   ₹9,400    first time sending to northwind-print" },
  { v: "ALLOW", cls: "lAllow", text: "acme-cloud    ₹11,240" },
];

const CMDS = [
  "pnpm install && pnpm --filter sirius build",
  "sirius scan .",
  "sirius report --format pdf",
  "sirius login --api-key <key>",
];

const STATS = [
  { target: 95, suffix: "%", label: "of actions proceeded with nobody asked" },
  { target: 0, suffix: "%", label: "of ordinary actions were intervened on" },
  { target: 871, suffix: "", label: "tests passing, checked by reverting the fix" },
  { target: 0, suffix: "", label: "backend services — local-first, no network, no account" },
];

const SECTION_IDS = ["hero", "problem", "stages", "feed", "cap", "trail", "scan", "stats", "cta"];

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - window.innerHeight;
      setP(max > 0 ? window.scrollY / max : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return p;
}

function useInView(id: string, threshold = 0.32) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!("IntersectionObserver" in window)) return setV(true);
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setV(true)),
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, threshold]);
  return v;
}

function useCountUp(active: boolean, target: number, suffix: string, duration = 1200) {
  const [val, setVal] = useState(`0${suffix}`);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(`${Math.floor(target * (1 - Math.pow(1 - p, 3)))}${suffix}`);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, suffix, duration]);
  return val;
}

export default function SiriusLanding() {
  const { isSignedIn, isLoaded } = useSession();
  const scrollProgress = useScrollProgress();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [consentHidden, setConsentHidden] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [theme, setTheme] = useState<"night" | "day">("night");
  const [tamper, setTamper] = useState(false);
  const [trailStatus, setTrailStatus] = useState("");
  const [feedLines, setFeedLines] = useState<{ cls: string; text: string }[]>([]);
  const [feedRunning, setFeedRunning] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [motion, setMotion] = useState(0);

  // theme toggle (Untitled-1.html)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("sirius-theme", theme);
    } catch { /* noop */ }
  }, [theme]);

  // section reveal-on-scroll
  useEffect(() => {
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!("IntersectionObserver" in window)) {
        setVisible((v) => ({ ...v, [id]: true }));
        return;
      }
      const io = new IntersectionObserver(
        (es) => es.forEach((e) => e.isIntersecting && setVisible((v) => ({ ...v, [id]: true }))),
        { threshold: 0.32 },
      );
      io.observe(el);
    });
  }, []);

  const grantCamera = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setConsentHidden(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCalibrating(true);
        setTimeout(() => {
          setWebcamOn(true);
          setConsentHidden(true);
          setCalibrating(false);
        }, 1100);
      })
      .catch(() => setConsentHidden(true));
  }, []);

  // webcam motion → drives the 3D models' reaction (rotate / pulse / color)
  useEffect(() => {
    if (!webcamOn) return;
    const video = videoRef.current;
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 32;
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    let last: Uint8ClampedArray | null = null;
    let raf = 0;
    const tick = () => {
      if (video && video.readyState >= 2 && sctx) {
        try {
          sctx.drawImage(video, 0, 0, 64, 32);
          const data = sctx.getImageData(0, 0, 64, 32).data;
          if (last) {
            let diff = 0;
            for (let i = 0; i < data.length; i += 8) diff += Math.abs(data[i] - last[i]) + Math.abs(data[i + 1] - last[i + 1]);
            const m = Math.min(1, diff / 6000);
            setMotion((prev) => prev + (m - prev) * 0.15);
          }
          last = data.slice();
        } catch { /* ignore */ }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [webcamOn]);

  const runFeed = useCallback(() => {
    if (feedRunning) return;
    setFeedRunning(true);
    setFeedLines([]);
    let i = 0;
    const iv = setInterval(() => {
      if (i >= FEED.length) {
        clearInterval(iv);
        setFeedLines((p) => [...p, { cls: "", text: "\nDecisions   264 allowed (95%)   2 step-up   1 constrained   11 blocked\nAutonomy    95.0% of actions proceeded with nobody asked" }]);
        setFeedRunning(false);
        return;
      }
      const f = FEED[i];
      setFeedLines((p) => [...p, { cls: f.cls, text: `${f.v.padEnd(10, " ")}${f.text}` }]);
      i++;
    }, 420);
  }, [feedRunning]);

  const copyCmd = useCallback((cmd: string, idx: number) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).then(() => {
        setCopied(idx);
        setTimeout(() => setCopied(null), 1400);
      });
    }
  }, []);

  const demoLogin = useCallback(async () => {
    try {
      const { token, user } = await api.auth.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      localStorage.setItem("sirius.token", token);
      setSessionCookie(token);
      window.location.href = "/dashboard";
    } catch { /* handled by toast */ }
  }, []);

  const scanVisible = useInView("scan");
  const statsVisible = useInView("stats");
  const [money, setMoney] = useState("₹0");
  useEffect(() => {
    if (!scanVisible) return;
    let start: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / 1600, 1);
      setMoney(`₹${Math.floor(8930000 * (1 - Math.pow(1 - p, 3))).toLocaleString("en-IN")}`);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scanVisible]);

  return (
    <div className={styles.landing} data-theme={theme}>
      {/* hidden webcam feed */}
      <video ref={videoRef} autoPlay muted playsInline className={styles.srcVideo} />

      {/* webcam consent */}
      <div className={`${styles.consent} ${consentHidden ? styles.consentHidden : ""}`}>
        <div className={`${styles.glass} ${styles.consentBox}`}>
          <h2>Before we begin</h2>
          <p>
            Sirius watches every action an agent takes and decides whether it should happen. This page
            can watch <em>you</em> the same way — your camera&apos;s motion drives the star. Nothing is
            uploaded; it never leaves this tab.
          </p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={grantCamera}>
              Begin — grant camera access
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setConsentHidden(true)}>
              Skip, use a generated visualization
            </button>
          </div>
          {calibrating && <div className={styles.calibrating}>calibrating background… hold still</div>}
        </div>
      </div>

      {/* glassmorphic 3D model stage — right-side sculpture per section,
          reacts to webcam motion when the camera is granted */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        <ModelStage fracture={tamper ? 1 : 0} webcamMotion={motion} videoRef={videoRef} webcamOn={webcamOn} />
      </div>
      {/* the person, as 3D pixels — centered, visible only when camera granted */}
      {webcamOn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none" }}>
          <WebcamPixels videoRef={videoRef} />
        </div>
      )}
      <div className={styles.grain} />
      <div className={styles.vignette} />

      {/* nav */}
      <nav className={styles.nav}>
        <a className={styles.word} href="#hero">SIRIUS</a>
        <div className={styles.right}>
          <div className={styles.links}>
            <a href="#problem">Problem</a>
            <a href="#stages">Stages</a>
            <a href="#trail">Trail</a>
            <a href="#scan">Scan</a>
            <a href="#cta">Install</a>
          </div>
          {/* day/night toggle (Untitled-1.html) */}
          <button className={styles.themeToggle} onClick={() => setTheme((t) => (t === "night" ? "day" : "night"))} title="Toggle theme">
            <span className={styles.knob}>{theme === "night" ? "☾" : "☀"}</span>
          </button>
          {isLoaded &&
            (isSignedIn ? (
              <Link href="/dashboard" className={styles.navCta}>
                Console →
              </Link>
            ) : (
              <Link href="/login" className={styles.navCta}>
                Sign in
              </Link>
            ))}
        </div>
      </nav>

      <main className={styles.main}>
        {/* HERO */}
        <section id="hero" className={`${styles.panel} ${styles.panelCenter} ${visible.hero ? styles.panelVisible : ""}`}>
          <div className={styles.content}>
            <div className={styles.heroMark}>
              <span className={styles.dot} />
              <span>LOCAL-FIRST · NO BACKEND · NO NETWORK</span>
            </div>
            <h1 className={styles.h1}>
              An agent with a wallet
              <br />
              is a new kind of actor.
            </h1>
            <p className={styles.lede}>
              It holds credentials, decides for itself, and signs its own transactions. Every one of
              those transactions can be perfectly valid — and still be the wrong thing to do.
            </p>
            <div className={styles.btnRow} style={{ justifyContent: "center", marginTop: "1.8rem" }}>
              <Link href="/login" className={`${styles.btn} ${styles.btnPrimary}`} style={{ textDecoration: "none" }}>
                Open the console
              </Link>
              <Link href="/scans" className={styles.btn} style={{ textDecoration: "none" }}>
                View scans
              </Link>
              <a href="#cta" className={`${styles.btn} ${styles.btnGhost}`} style={{ textDecoration: "none" }}>
                Install the CLI
              </a>
            </div>
            <p className={styles.micro} style={{ margin: "1.2rem auto 0" }}>
              Sirius decides, per action, whether it should happen — and keeps a signed record of every
              decision, including the ones it allowed.
            </p>
          </div>
          <div className={styles.scrollCue}><span>SCROLL</span><span className={styles.chev} /></div>
        </section>

        {/* PROBLEM */}
        <section id="problem" className={`${styles.panel} ${visible.problem ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>The problem</p>
              <h2 className={styles.h2}>Technical validity is not behavioural legitimacy.</h2>
              <p className={styles.body}>
                A transaction can be correctly signed, properly authenticated, inside the agent&apos;s own
                credentials — and still be a transfer it has never made before, to a counterparty it has
                never used, because a web page it was reading told it to.
              </p>
              <p className={styles.body}><strong>So the answer has to be graduated.</strong></p>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · decision vault</span>
            </div>
          </div>
        </section>

        {/* STAGES */}
        <section id="stages" className={`${styles.panel} ${visible.stages ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>Six questions, asked of every action</p>
              <h2 className={styles.h2}>Nothing decides alone.</h2>
              <p className={styles.lede}>
                Each stage raises signals, and the verdict is the strongest one. A large amount to a
                first-time counterparty, on an instruction fetched from a web page, is not routine.
              </p>
              <div className={styles.stageGrid}>
                {STAGES.map((s) => <StageCard key={s.n} {...s} />)}
              </div>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · decision matrix</span>
            </div>
          </div>
        </section>

        {/* FEED */}
        <section id="feed" className={`${styles.panel} ${visible.feed ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>The decision trail</p>
              <h2 className={styles.h2}>264 allowed. 11 blocked. All of them logged.</h2>
              <p className={styles.lede}>Every action an agent proposes runs the same six checks. Watch a batch of 278 get judged.</p>
              <div className={styles.btnRow}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={runFeed} disabled={feedRunning}>
                  Run 278 actions
                </button>
              </div>
              <div className={styles.term}>
                {feedLines.map((l, i) => (
                  <div key={i} className={`${styles.feedLine} ${styles[l.cls]}`}>{l.text}</div>
                ))}
              </div>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · ledger pipeline</span>
            </div>
          </div>
        </section>

        {/* CAP */}
        <section id="cap" className={`${styles.panel} ${visible.cap ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>The attacker who read the policy</p>
              <h2 className={styles.h2}>Right under the cap is exactly where they aim.</h2>
              <p className={styles.body}>
                A cap stops an action that exceeds it — and says nothing about one that lands at 99% of it.
                At ₹49,500 against a ₹50,000 cap, there is no limit breach and only 2σ on amount.
              </p>
              <div className={styles.caseline}>
                ! BLOCK wlt-9f2c41 ₹49,500 — an amount sized just under the cap, to a counterparty never
                used before. The limit was not breached because it was measured first.
              </div>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · cap caliper</span>
            </div>
          </div>
        </section>

        {/* TRAIL */}
        <section id="trail" className={`${styles.panel} ${visible.trail ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>The decisions are the product</p>
              <h2 className={styles.h2}>Including the ones it allowed.</h2>
              <p className={styles.lede}>
                Every decision — allowed or not — is hash-chained, and the sealed trail is ed25519-signed.
              </p>
              <div className={styles.trailActions}>
                <button className={styles.btn} onClick={() => { setTamper(false); setTrailStatus("OK      decisions-mtcnin36.json\n        278 decisions, chained and unbroken\n        signed 2026-08-28T07:49:52.870Z by key e960b577e03659b4"); }}>
                  sirius guard trail --verify
                </button>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { setTamper(true); setTrailStatus("FAILED  tampered.json\n        entry 255 has been altered since it was written"); }}>
                  tamper with entry 255
                </button>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { setTamper(false); setTrailStatus(""); }}>
                  reset
                </button>
              </div>
              <div className={styles.trailStatus}>{trailStatus}</div>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · hash chain</span>
            </div>
          </div>
        </section>

        {/* SCAN */}
        <section id="scan" className={`${styles.panel} ${visible.scan ? styles.panelVisible : ""}`}>
          <div className={styles.panelGrid}>
            <div className={styles.contentCol}>
              <p className={styles.eyebrow}>The second surface</p>
              <h2 className={styles.h2}>It also secures the code the agent runs on.</h2>
              <p className={styles.lede}>
                The same tool scans that code before deployment, maps each finding to a compliance clause,
                and prices the exposure in rupees.
              </p>
              <div className={styles.codeCard}>
                <span className={styles.sev}>✗ CRITICAL</span> SIR-SEC-001 Hardcoded payment-provider secret key{" "}
                <span className={styles.loc}>src/config.py:14</span> PCI-DSS 8.6.2 · DPDP §8{"\n"}
                14 │ STRIPE_KEY = &quot;sk_live_51H8xR2eZv…&quot; │{" "}
                <span className={styles.flag}>╰── secret · ⚠ VERIFIED LIVE · ₹42,00,000 at risk</span>
              </div>
              <div className={styles.scanSummary}>
                <div><span className={styles.v}>{money}</span><span className={styles.k}>MONEY @ RISK</span></div>
                <div><span className={styles.v}>60/100</span><span className={styles.k}>COMPLIANCE SCORE</span></div>
                <div><span className={styles.v}>2 crit · 2 high · 2 med</span><span className={styles.k}>FINDINGS · 3 FILES</span></div>
              </div>
            </div>
            <div className={styles.stage3dHint}>
              <span className={styles.hintPill}><span className={styles.pulseDot} /> 3D · code hologram</span>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section id="stats" className={`${styles.panel} ${styles.panelCenter} ${visible.stats ? styles.panelVisible : ""}`}>
          <div className={`${styles.content} ${styles.contentWide}`} style={{ maxWidth: 900 } as CSSProperties}>
            <p className={styles.eyebrow}>What the fixture shows</p>
            <h2 className={styles.h2}>Every planted attack stopped. Nothing ordinary touched.</h2>
            <div className={styles.statGrid}>
              {STATS.map((s, i) => <StatTile key={i} {...s} active={statsVisible} />)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="cta" className={`${styles.panel} ${styles.panelCenter} ${visible.cta ? styles.panelVisible : ""}`}>
          <div className={styles.content}>
            <p className={styles.eyebrow}>Try it</p>
            <h2 className={styles.h2}>Requires Node ≥ 22 and pnpm.</h2>
            {CMDS.map((cmd, i) => (
              <div className={styles.cmdRow} key={i}>
                <code>{cmd}</code>
                <button className={styles.copyBtn} onClick={() => copyCmd(cmd, i)}>{copied === i ? "copied" : "copy"}</button>
              </div>
            ))}
            <p className={styles.micro} style={{ margin: "1.2rem auto 0" }}>
              sirius runs entirely on your machine and streams every scan into the Sirius console — same
              engine, same findings, live in the dashboard.
            </p>
            <div className={styles.btnRow} style={{ justifyContent: "center", marginTop: "1.6rem" }}>
              <Link href="/login" className={`${styles.btn} ${styles.btnPrimary}`} style={{ textDecoration: "none" }}>Enter the console</Link>
              <Link href="/signup" className={styles.btn} style={{ textDecoration: "none" }}>Get started</Link>
              <Link href="/scans" className={`${styles.btn} ${styles.btnGhost}`} style={{ textDecoration: "none" }}>View scans</Link>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={demoLogin}>Demo session</button>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.word}>SIRIUS</span>
        Fintech compliance scanning and agent control, priced in rupees.
        <br />
        Runs entirely on your machine.
      </footer>
    </div>
  );
}

function StageCard(s: { n: string; name: string; q: string; ex: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={`${styles.stageCard} ${revealed ? styles.stageCardRevealed : ""}`} onClick={() => setRevealed((v) => !v)}>
      <div className={styles.num}>{s.n}</div>
      <h3>{s.name}</h3>
      <p className={styles.q}>{s.q}</p>
      <div className={styles.ex}>{s.ex}</div>
    </div>
  );
}

function StatTile({ target, suffix, label, active }: { target: number; suffix: string; label: string; active: boolean }) {
  const val = useCountUp(active, target, suffix);
  return (
    <div className={`${styles.statTile} ${styles.glass}`}>
      <div className={styles.v}>{val}</div>
      <div className={styles.l}>{label}</div>
    </div>
  );
}
