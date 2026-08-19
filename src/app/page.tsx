"use client";

import { useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './veyl.module.css';
import SelectWallet from './components/client/WalletHandle/SelectWallet';

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
const IconChevronDown = () => (
  <svg viewBox="0 0 32 32"><path fill="#FF5A2E" d="M16 22L6 12l1.4-1.4l8.6 8.6l8.6-8.6L26 12z"/></svg>
);
const IconGithub = () => (
  <svg viewBox="0 0 32 32"><path fill="#FF5A2E" fillRule="evenodd" d="M16 2a14 14 0 0 0-4.43 27.28c.7.13 1-.3 1-.67v-2.38c-3.89.84-4.71-1.88-4.71-1.88a3.7 3.7 0 0 0-1.62-2.05c-1.27-.86.1-.85.1-.85a2.94 2.94 0 0 1 2.14 1.45a3 3 0 0 0 4.08 1.16a2.93 2.93 0 0 1 .88-1.87c-3.1-.36-6.37-1.56-6.37-6.92a5.4 5.4 0 0 1 1.44-3.76a5 5 0 0 1 .14-3.7s1.17-.38 3.85 1.43a13.3 13.3 0 0 1 7 0c2.67-1.81 3.84-1.43 3.84-1.43a5 5 0 0 1 .14 3.7a5.4 5.4 0 0 1 1.44 3.76c0 5.38-3.27 6.56-6.39 6.91a3.33 3.33 0 0 1 .95 2.59v3.84c0 .46.25.81 1 .67A14 14 0 0 0 16 2"/></svg>
);

const WHY = [
  { Icon: IconShield, title: 'Cryptographic privacy', body: 'Sender, recipient, and amount stay encrypted inside the STRK20 privacy pool. That privacy comes from cryptography, not from a policy someone has to trust.' },
  { Icon: IconActivity, title: 'Runs on the real pool', body: 'Every shield, transfer, and trade runs against the actual STRK20 privacy pool contract, not a simulation. Veyl is testing on Starknet Sepolia before moving fully to Mainnet.' },
  { Icon: IconRocket, title: 'Private token launches', body: 'Every bid is locked in privately and only revealed once the round ends, so bots cannot front-run the opening block.' },
  { Icon: IconLocked, title: 'You hold the keys', body: 'Veyl never holds your funds. You shield and trade through your own wallet the whole time.' },
];

const FAQ = [
  {
    q: 'Is Veyl a launchpad?',
    a: 'No. Veyl is a private trading terminal. Fair token launches are one feature built using the same privacy technology, not the main product.',
  },
  {
    q: 'Which tokens can I trade?',
    a: "Any token that has liquidity on Starknet. Memecoins are the clearest early use case, but that's not a limit. Veyl adds a privacy layer on top of trading, it doesn't maintain its own fixed list of tokens.",
  },
  {
    q: "How is this different from just shielding funds in my wallet?",
    a: "Your wallet can already shield and unshield funds on its own, but it's deliberately blocked from touching your viewing key (the private key that decrypts your shielded balance). That's what keeps your wallet secure, but it also means your wallet alone can't generate a new, unlinked wallet for each trade, or run a private auction for a token launch. Both need a backend service, which is what Veyl adds on top of the shield and unshield features your wallet already has.",
  },
  {
    q: 'Does Veyl custody my funds?',
    a: 'No. You shield and trade through your own connected wallet the entire time. Veyl never holds your assets.',
  },
  {
    q: 'Is this live on mainnet?',
    a: "Veyl's code (shield, unshield, private transfer, and the fair-launch contract) is built to run on the real STRK20 pool, on Starknet Mainnet or Sepolia. Veyl is currently testing on Sepolia before moving fully to Mainnet. See strk20.json in the repo for the current deployed contracts and live transactions.",
  },
];

export default function Page() {
  const root = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
      <div className={styles.ambientGlow} aria-hidden="true" />
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a href="#top" className={styles.wordmark}>VEYL</a>
          <nav className={styles.navLinks}>
            <a href="#how">How it works</a>
            <a href="#why">Why Veyl</a>
            <Link href="/dashboard">App</Link>
          </nav>
          <SelectWallet variant="nav" />
        </div>
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
            <h1 className={`${styles.h1} js-h1`}>Trade Starknet Tokens<br />Without Exposing Your Wallet</h1>
            <p className={`${styles.lede} js-lede`}>
              Trade any token with liquidity on Starknet from a wallet address that
              can&apos;t be linked back to the funds behind it. Shield your funds once, then trade as often as you like.
            </p>
            <div className={`${styles.heroCtas} js-ctas`}>
              <SelectWallet variant="ctaCompact" />
              <a href="#how" className={styles.btnGhost}>See how it works →</a>
            </div>
          </div>

          <div className={`${styles.dashboardFloat} js-dashboard`}>
            <Image
              src="/media/trading-dashboard-transparent.png"
              alt="Veyl trading dashboard preview, showing markets, balances, and exchange panels"
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
              <h3>Veyl is both.</h3>
              <p>A trading terminal for any token with liquidity on Starknet, where every trade comes from a wallet address that can&apos;t be traced back to your funding wallet. It is not a launchpad. Fair token launches are one feature built on the same privacy technology, not the main product.</p>
            </div>
          </div>
        </section>

        {/* --- Beat 3: How it works — two tracks, tagged by how often you'd use them --- */}
        <section id="how" className={styles.section}>
          <div className={`${styles.sectionGrid} js-scroll-fade`}>
            <div className={styles.sectionText}>
              <span className={styles.eyebrow}>How it works</span>
              <h2 className={styles.h2}>One mechanism. Two tracks.</h2>
              <p className={styles.sectionSub}>The same idea powers both tracks below: lock something up, reveal it only when it settles, and never expose who is behind it. Trading uses this every time you trade. Launching uses it once per token.</p>

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
                      <p>Set the token and terms for a private auction round.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>02</span>
                    <div>
                      <h3>Bids come in privately</h3>
                      <p>Real funds are locked in as encrypted deposits. No one, including Veyl, can see who has bid or how much until the round ends.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>03</span>
                    <div>
                      <h3>Settles at once</h3>
                      <p>Every bid is revealed together and the round settles at a single price, so no one can act on early information.</p>
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

        {/* --- Beat 5: FAQ ------------------------------------------------------ */}
        <section id="faq" className={styles.section}>
          <div className={`${styles.sectionHead} js-scroll-fade`}>
            <span className={styles.eyebrow}>FAQ</span>
            <h2 className={styles.h2}>Questions worth answering straight.</h2>
          </div>
          <div className={`${styles.faqList} js-stagger-group`}>
            {FAQ.map(({ q, a }, i) => {
              const open = openFaq === i;
              return (
                <div className={styles.faqItem} data-open={open} key={q}>
                  <button
                    type="button"
                    className={styles.faqQuestion}
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{q}</span>
                    <span className={styles.faqIcon}><IconChevronDown /></span>
                  </button>
                  <div className={styles.faqAnswer}>
                    <div className={styles.faqAnswerInner}>
                      <p>{a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- Beat 6: Close CTA -------------------------------------------------- */}
        <section className={styles.section}>
          <div className={`${styles.ctaCard} js-scroll-fade`}>
            <div className={styles.ctaGlow} aria-hidden="true" />
            <svg className={styles.ctaLines} viewBox="0 0 1080 320" aria-hidden="true">
              <g stroke="#FF5A2E" strokeWidth="1" fill="none" opacity="0.35">
                <path d="M900 0 L900 60 L960 120 L960 200 L1020 260 L1020 320" />
                <path d="M980 0 L980 40 L1040 100 L1040 320" />
                <path d="M840 0 L840 80 L900 140 L900 320" />
              </g>
              <g fill="#FF5A2E" opacity="0.5">
                <circle cx="960" cy="120" r="3" />
                <circle cx="1020" cy="260" r="3" />
                <circle cx="1040" cy="100" r="3" />
                <circle cx="900" cy="140" r="3" />
              </g>
            </svg>
            <h2>Trade without being watched.</h2>
            <p>Shield once, then trade freely. Every action runs against the real STRK20 privacy pool contract on Starknet.</p>
            <div className={styles.heroCtas}>
              <SelectWallet variant="ctaCompact" />
            </div>
          </div>
        </section>
      </main>

      {/* --- Footer --------------------------------------------------------- */}
      <footer className={styles.footer}>
        <div className={`${styles.footerGrid} js-scroll-fade`}>
          <div className={styles.footerBrand}>
            <span className={styles.wordmark}>VEYL</span>
            <p>Private launch &amp; trading terminal on Starknet, built on the STRK20 privacy pool.</p>
            <span className={styles.creditStamp}>
              <IconTimer /> Live on Starknet
            </span>
          </div>
          <div className={styles.footerCol}>
            <h4>Product</h4>
            <ul>
              <li><a href="#how">How it works</a></li>
              <li><a href="#why">Why Veyl</a></li>
              <li><Link href="/dashboard">Try it live</Link></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div className={styles.footerCol}>
            <h4>Resources</h4>
            <ul>
              <li><a href="https://github.com/codeswithroh/veyl" target="_blank" rel="noreferrer"><IconGithub /> Repo</a></li>
              <li><a href="https://strk20-by-example.org/what-is-strk20" target="_blank" rel="noreferrer">STRK20 docs</a></li>
              <li><a href="https://www.starknet.io" target="_blank" rel="noreferrer">Starknet</a></li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <div className={styles.footerLinks}>
            <span>Built on Starknet.js v10.4.0 + STRK20</span>
          </div>
          <div className={styles.footerLinks}>
            <a href="https://github.com/codeswithroh/veyl/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT licensed</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
