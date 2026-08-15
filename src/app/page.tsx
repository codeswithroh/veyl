"use client";

import { useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './veyl.module.css';
import panelStyles from './uni.module.css';
import SelectWallet from './components/client/WalletHandle/SelectWallet';
import WalletAccountV6Tag from './components/client/WalletHandle/WalletAccountV6Tag';

// --- Inlined Iconify (carbon set) icons — design/assets/icons/*.svg, recolored
// to the locked ember primary (#FF5A2E) at fetch time. ---
const IconLocked = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="M24 14h-2V8a6 6 0 0 0-12 0v6H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V16a2 2 0 0 0-2-2M12 8a4 4 0 0 1 8 0v6h-8Zm12 20H8V16h16Z"/></svg>
);
const IconShuffle = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="M22.59 19.41L26.17 23h-6.62l-4.37-7l4.37-7h6.62l-3.58 3.59L24 14l6-6l-6-6l-1.41 1.41L26.17 7h-6.62a2 2 0 0 0-1.69.94L14 14.11l-3.86-6.17A2 2 0 0 0 8.45 7H2v2h6.45l4.37 7l-4.37 7H2v2h6.45a2 2 0 0 0 1.69-.94L14 17.89l3.86 6.17a2 2 0 0 0 1.69.94h6.62l-3.58 3.59L24 30l6-6l-6-6Z"/></svg>
);
const IconRocket = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="m7.288 23.292l7.997-7.997l1.414 1.414l-7.997 7.997z"/><path fill="#FF5A2E" d="M17 30a1 1 0 0 1-.37-.07a1 1 0 0 1-.62-.79l-1-7l2-.28l.75 5.27L21 24.52V17a1 1 0 0 1 .29-.71l4.07-4.07A8.94 8.94 0 0 0 28 5.86V4h-1.86a8.94 8.94 0 0 0-6.36 2.64l-4.07 4.07A1 1 0 0 1 15 11H7.48l-2.61 3.26l5.27.75l-.28 2l-7-1a1 1 0 0 1-.79-.62a1 1 0 0 1 .15-1l4-5A1 1 0 0 1 7 9h7.59l3.77-3.78A10.92 10.92 0 0 1 26.14 2H28a2 2 0 0 1 2 2v1.86a10.92 10.92 0 0 1-3.22 7.78L23 17.41V25a1 1 0 0 1-.38.78l-5 4A1 1 0 0 1 17 30"/></svg>
);
const IconTimer = () => (
  <svg viewBox="0 0 32 32" width="22" height="22"><path fill="#FF5A2E" d="M15 11h2v9h-2zm-2-9h6v2h-6z"/><path fill="#FF5A2E" d="m28 9l-1.42-1.41l-2.25 2.25a10.94 10.94 0 1 0 1.18 1.65ZM16 26a9 9 0 1 1 9-9a9 9 0 0 1-9 9"/></svg>
);
const IconShield = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="M17 18h-2V7h2zm-2.5 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 0 0-3 0m1.979 7.378l5.786-3.156C25.803 24.792 28 21.067 28 17V4c0-1.103-.897-2-2-2H6c-1.103 0-2 .897-2 2v13c0 4.067 2.198 7.792 5.735 9.722l5.786 3.156a1 1 0 0 0 .958 0M26 4v13c0 3.335-1.798 6.387-4.692 7.966L16 27.86l-5.307-2.895C7.798 23.386 6 20.335 6 17V4z"/></svg>
);
const IconActivity = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="M12 29a1 1 0 0 1-.92-.62L6.33 17H2v-2h5a1 1 0 0 1 .92.62L12 25.28l8.06-21.63A1 1 0 0 1 21 3a1 1 0 0 1 .93.68L25.72 15H30v2h-5a1 1 0 0 1-.95-.68L21 7l-8.06 21.35A1 1 0 0 1 12 29"/></svg>
);
const IconTerminal = () => (
  <svg viewBox="0 0 32 32" width="26" height="26"><path fill="#FF5A2E" d="M26 4.01H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-20a2 2 0 0 0-2-2m0 2v4H6v-4Zm-20 20v-14h20v14Z"/><path fill="#FF5A2E" d="m10.76 16.18l2.82 2.83l-2.82 2.83l1.41 1.41l4.24-4.24l-4.24-4.24z"/></svg>
);

const WHY = [
  { Icon: IconShield, title: 'Cryptographic privacy', body: 'Sender, recipient, and amount stay encrypted inside the STRK20 pool — not hidden by policy, hidden by math.' },
  { Icon: IconActivity, title: 'Real STRK20 mainnet', body: 'No testnet theater. Every shield, transfer, and trade runs against the live pool on Starknet.' },
  { Icon: IconRocket, title: 'Sealed-bid fair launches', body: 'Bids are escrowed notes, revealed only at settlement — no first-block sniping war.' },
  { Icon: IconLocked, title: 'You hold the keys', body: 'Veyl never custodies funds. Shield and trade through your own wallet, end to end.' },
];

export default function Page() {
  const root = useRef<HTMLDivElement>(null);

  // GSAP + ScrollTrigger, per .tastemaker/style-lock.md's motion spec for this
  // marketing screen: a sequenced hero entrance timeline (above the fold, plays
  // once on load) + scroll-triggered staggered reveals for everything below.
  // useLayoutEffect + gsap.set-before-paint means no CSS opacity:0 fallback is
  // needed — GSAP owns the initial hidden state, so there's no FOUC either way.
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          motionOK: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };
          const dur = reduceMotion ? 0.01 : 0.7;
          const shortDur = reduceMotion ? 0.01 : 0.55;
          const stagger = reduceMotion ? 0 : 0.12;

          // Sequenced hero entrance — plays once, above the fold, no scroll needed.
          gsap
            .timeline({ defaults: { ease: 'power3.out', duration: dur } })
            .from('.js-eyebrow', { opacity: 0, y: 16 })
            .from('.js-h1', { opacity: 0, y: 24 }, '-=0.45')
            .from('.js-lede', { opacity: 0, y: 16 }, '-=0.4')
            .from('.js-ctas', { opacity: 0, y: 16 }, '-=0.35')
            .from('.js-dashboard', { opacity: 0, y: 48, scale: 0.98 }, '-=0.3');

          // Scroll-triggered single-element fades (section heads, connector art).
          gsap.utils.toArray<HTMLElement>('.js-scroll-fade').forEach((el) => {
            gsap.from(el, {
              opacity: 0,
              y: 24,
              duration: shortDur,
              ease: 'power2.out',
              scrollTrigger: { trigger: el, start: 'top 85%', once: true },
            });
          });

          // Scroll-triggered staggered groups (the 3 how-it-works steps, the 4
          // why-cards) — each child fades/lifts in slightly after the last.
          gsap.utils.toArray<HTMLElement>('.js-stagger-group').forEach((group) => {
            gsap.from(group.children, {
              opacity: 0,
              y: 20,
              duration: shortDur,
              ease: 'power2.out',
              stagger,
              scrollTrigger: { trigger: group, start: 'top 85%', once: true },
            });
          });
        }
      );
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div className={styles.page} ref={root}>
      <header className={styles.nav}>
        <a href="#top" className={styles.wordmark}>VEYL</a>
        <nav className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#why">Why Veyl</a>
          <a href="#app">App</a>
        </nav>
        <SelectWallet variant="nav" />
      </header>

      <main id="top">
        {/* --- Beat 1: Hook — video hero + floating dashboard mockup --------- */}
        <section className={styles.hero}>
          <video
            className={styles.heroVideo}
            src="/media/hero-bg.mp4"
            poster="/media/hero-bg-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            aria-hidden
          />
          <div className={styles.heroScrim} aria-hidden />

          <div className={styles.heroContent}>
            <span className={`${styles.eyebrow} js-eyebrow`}>The private trading terminal for Starknet</span>
            <h1 className={`${styles.h1} js-h1`}>Step Into The Future<br />Of Private Trading</h1>
            <p className={`${styles.lede} js-lede`}>
              Trade any token Starknet has liquidity for — from an execution identity
              that isn&apos;t linkable back to your funding wallet. Shield once, trade freely.
            </p>
            <div className={`${styles.heroCtas} js-ctas`}>
              <SelectWallet variant="ctaBig" />
              <a href="#how" className={styles.btnGhost}>See how it works →</a>
            </div>
          </div>

          <div className={`${styles.dashboardFloat} js-dashboard`}>
            <Image
              src="/media/trading-dashboard-transparent.png"
              alt="Veyl trading dashboard preview — markets, balance, exchange panels"
              width={1582}
              height={597}
              className={styles.dashboardImg}
              priority
            />
          </div>
        </section>

        {/* --- Beat 2: Positioning — what category this actually is ------------ */}
        <section className={styles.section}>
          <div className={`${styles.sectionHead} js-scroll-fade`}>
            <span className={styles.eyebrow}>What this is</span>
            <h2 className={styles.h2}>Two things that don&apos;t exist together yet.</h2>
          </div>
          <div className={`${styles.positionGrid} js-stagger-group`}>
            <div className={styles.positionCard}>
              <IconTerminal />
              <span className={styles.tag}>Trading terminals</span>
              <h3>Fast, but public</h3>
              <p>One-click swaps, market discovery, built for speed. Every trade traces straight back to your wallet.</p>
            </div>
            <div className={styles.positionMerge} aria-hidden="true">+</div>
            <div className={styles.positionCard}>
              <IconShield />
              <span className={styles.tag}>Privacy protocols</span>
              <h3>Private, but not a terminal</h3>
              <p>Shielded balances, unlinkable transfers. Built as a wallet feature, not a place to trade.</p>
            </div>
            <div className={styles.positionResult}>
              <h3>Veyl is both, at once.</h3>
              <p>A trading terminal for any token Starknet has liquidity for — where the identity behind every trade is cryptographically unlinkable. Not a launchpad; fair launches are one feature built on the same mechanism.</p>
            </div>
          </div>
        </section>

        {/* --- Beat 3: How it works — two tracks, tagged by how often you'd use them --- */}
        <section id="how" className={styles.section}>
          <div className={`${styles.sectionGrid} js-scroll-fade`}>
            <div className={styles.sectionText}>
              <span className={styles.eyebrow}>How it works</span>
              <h2 className={styles.h2}>One mechanism. Two tracks.</h2>
              <p className={styles.sectionSub}>Escrow something, reveal it only at settlement, never expose who&apos;s behind it. Trading uses this constantly; launching uses it once per token.</p>

              <div className={styles.track}>
                <div className={styles.trackHead}>
                  <h4>Trade privately</h4>
                  <span className={`${styles.trackTag} ${styles.everyday}`}>Everyday</span>
                </div>
                <div className={`${styles.steps} js-stagger-group`}>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>01</span>
                    <div>
                      <h3>Shield</h3>
                      <p>Deposit into the STRK20 privacy pool.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>02</span>
                    <div>
                      <h3>Fresh identity</h3>
                      <p>A per-trade wallet, generated from your shielded funds, acts for you.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>03</span>
                    <div>
                      <h3>Trade unlinked</h3>
                      <p>Your funding wallet and your trade are never provably the same address.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.track}>
                <div className={styles.trackHead}>
                  <h4>Launch a token</h4>
                  <span className={`${styles.trackTag} ${styles.occasional}`}>Occasional</span>
                </div>
                <div className={`${styles.steps} js-stagger-group`}>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>01</span>
                    <div>
                      <h3>List the launch</h3>
                      <p>Set the token and terms for a sealed-bid round.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>02</span>
                    <div>
                      <h3>Sealed bids come in</h3>
                      <p>Real funds, escrowed as encrypted notes — nobody sees the book.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>03</span>
                    <div>
                      <h3>Settles at once</h3>
                      <p>One clearing price, revealed only at settlement. No first-block snipe.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={`${styles.connectorWrap} js-scroll-fade`}>
              <Image
                src="/media/risk-management.svg"
                alt="Diagram: two wallets connecting through Veyl's privacy layer"
                width={584}
                height={410}
                className={styles.connectorImg}
              />
            </div>
          </div>
        </section>

        {/* --- Beat 3: Why Veyl ------------------------------------------------ */}
        <section id="why" className={styles.section}>
          <div className={`${styles.sectionHead} js-scroll-fade`}>
            <span className={styles.eyebrow}>Why Veyl</span>
            <h2 className={styles.h2}>Privacy without the trust fall.</h2>
          </div>
          <div className={`${styles.whyGrid} js-stagger-group`}>
            {WHY.map(({ Icon, title, body }) => (
              <div className={styles.whyCard} key={title}>
                <div className={styles.whyIconBadge}><Icon /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- Beat 4: App embed ------------------------------------------------ */}
        <section id="app" className={styles.appSection}>
          <div className={`${styles.sectionHead} js-scroll-fade`}>
            <span className={styles.eyebrow}>Try it live</span>
            <h2 className={styles.h2}>Wired to the real STRK20 mainnet pool.</h2>
          </div>
          <div className={panelStyles.page} style={{ minHeight: 'auto', padding: '0 0 40px', background: 'transparent' }}>
            <WalletAccountV6Tag />
          </div>
        </section>
      </main>

      {/* --- Beat 5: Close --------------------------------------------------- */}
      <footer className={`${styles.footer} js-scroll-fade`}>
        <span className={styles.creditStamp}>
          <IconTimer /> Cleared on Starknet · STRK20 mainnet pool
        </span>
        <div className={styles.footerLinks}>
          <a href="https://github.com/codeswithroh/veyl" target="_blank" rel="noreferrer">Repo</a>
          <span className={styles.footerDot}>·</span>
          <span>Built on Starknet.js v10.4.0 + STRK20</span>
        </div>
      </footer>
    </div>
  );
}
