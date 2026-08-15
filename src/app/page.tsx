"use client";

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import styles from './veyl.module.css';
import panelStyles from './uni.module.css';
import SelectWallet from './components/client/WalletHandle/SelectWallet';
import WalletAccountV6Tag from './components/client/WalletHandle/WalletAccountV6Tag';

// --- Inlined Iconify (carbon set) icons — design/assets/icons/*.svg, tinted to
// the locked accent (#C97B5F) at fetch time. Inlined so no extra network hop. ---
const IconLocked = () => (
  <svg viewBox="0 0 32 32" width="28" height="28"><path fill="#C97B5F" d="M24 14h-2V8a6 6 0 0 0-12 0v6H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V16a2 2 0 0 0-2-2M12 8a4 4 0 0 1 8 0v6h-8Zm12 20H8V16h16Z"/></svg>
);
const IconShuffle = () => (
  <svg viewBox="0 0 32 32" width="28" height="28"><path fill="#C97B5F" d="M22.59 19.41L26.17 23h-6.62l-4.37-7l4.37-7h6.62l-3.58 3.59L24 14l6-6l-6-6l-1.41 1.41L26.17 7h-6.62a2 2 0 0 0-1.69.94L14 14.11l-3.86-6.17A2 2 0 0 0 8.45 7H2v2h6.45l4.37 7l-4.37 7H2v2h6.45a2 2 0 0 0 1.69-.94L14 17.89l3.86 6.17a2 2 0 0 0 1.69.94h6.62l-3.58 3.59L24 30l6-6l-6-6Z"/></svg>
);
const IconRocket = () => (
  <svg viewBox="0 0 32 32" width="28" height="28"><path fill="#C97B5F" d="m7.288 23.292l7.997-7.997l1.414 1.414l-7.997 7.997z"/><path fill="#C97B5F" d="M17 30a1 1 0 0 1-.37-.07a1 1 0 0 1-.62-.79l-1-7l2-.28l.75 5.27L21 24.52V17a1 1 0 0 1 .29-.71l4.07-4.07A8.94 8.94 0 0 0 28 5.86V4h-1.86a8.94 8.94 0 0 0-6.36 2.64l-4.07 4.07A1 1 0 0 1 15 11H7.48l-2.61 3.26l5.27.75l-.28 2l-7-1a1 1 0 0 1-.79-.62a1 1 0 0 1 .15-1l4-5A1 1 0 0 1 7 9h7.59l3.77-3.78A10.92 10.92 0 0 1 26.14 2H28a2 2 0 0 1 2 2v1.86a10.92 10.92 0 0 1-3.22 7.78L23 17.41V25a1 1 0 0 1-.38.78l-5 4A1 1 0 0 1 17 30"/></svg>
);
const IconTimer = () => (
  <svg viewBox="0 0 32 32" width="24" height="24"><path fill="#C97B5F" d="M15 11h2v9h-2zm-2-9h6v2h-6z"/><path fill="#C97B5F" d="m28 9l-1.42-1.41l-2.25 2.25a10.94 10.94 0 1 0 1.18 1.65ZM16 26a9 9 0 1 1 9-9a9 9 0 0 1-9 9"/></svg>
);
const IconShield = () => (
  <svg viewBox="0 0 32 32" width="24" height="24"><path fill="#C97B5F" d="M17 18h-2V7h2zm-2.5 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 0 0-3 0m1.979 7.378l5.786-3.156C25.803 24.792 28 21.067 28 17V4c0-1.103-.897-2-2-2H6c-1.103 0-2 .897-2 2v13c0 4.067 2.198 7.792 5.735 9.722l5.786 3.156a1 1 0 0 0 .958 0M26 4v13c0 3.335-1.798 6.387-4.692 7.966L16 27.86l-5.307-2.895C7.798 23.386 6 20.335 6 17V4z"/></svg>
);

const BG_TOKENS: { pos: CSSProperties; size: number }[] = [
  { pos: { top: '18%', left: '4%' }, size: 90 },
  { pos: { top: '62%', left: '7%' }, size: 120 },
  { pos: { top: '10%', right: '6%' }, size: 100 },
  { pos: { top: '70%', right: '5%' }, size: 110 },
];

export default function Page() {
  const revealRefs = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(styles.in));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.in);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px -15% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      {/* Halftone dot field, code-native, matches style-lock's texture system */}
      <div className={styles.halftoneBg} aria-hidden>
        {BG_TOKENS.map((t, i) => (
          <span key={i} className={styles.dotCluster} style={{ ...t.pos, width: t.size, height: t.size }} />
        ))}
      </div>

      <header className={styles.nav}>
        <a href="#top" className={styles.wordmark}>VEYL</a>
        <nav className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#markets">Mechanics</a>
          <a href="#app">App</a>
        </nav>
        <SelectWallet variant="nav" />
      </header>

      <main id="top">
        {/* --- Beat 1: Hook ------------------------------------------------ */}
        <section className={styles.hero}>
          <div className={styles.heroGrid}>
            <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={styles.revealEl}>
              <div className={styles.stickerRow}>
                <span className={`${styles.sticker} ${styles.rot1}`}>UTXO NOTES</span>
                <span className={`${styles.sticker} ${styles.stickerAlt} ${styles.rot4}`}>~29S PROOF</span>
              </div>
              <h1 className={styles.h1}>
                Trade Without
                <span className={styles.script}>being watched.</span>
              </h1>
              <p className={styles.lede}>
                Veyl shields your funds into the STRK20 pool, then trades and launches
                from an execution identity that isn&apos;t linkable back to your wallet
                — so copy-traders and snipers have nothing to follow.
              </p>
              <div className={styles.heroCtas}>
                <SelectWallet variant="ctaBig" />
                <a href="#how" className={styles.btnGhost}>See the mechanism ↓</a>
              </div>
            </div>

            <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.diagram} ${styles.revealEl}`}>
              <div className={styles.diagramRow}>
                <div className={styles.diagramNode}>
                  <IconLocked />
                  <span>Shield</span>
                </div>
                <div className={styles.diagramArrow} />
                <div className={styles.diagramNode}>
                  <IconShuffle />
                  <span>Unlinkable wallet</span>
                </div>
                <div className={styles.diagramArrow} />
                <div className={styles.diagramNode}>
                  <IconRocket />
                  <span>Trade / launch</span>
                </div>
              </div>
              <p className={styles.diagramCaption}>
                Deposit and withdrawal amounts stay visible on Starknet, same as any
                pool interaction — what&apos;s hidden is the link between the two ends.
              </p>
            </div>
          </div>
        </section>

        {/* --- Beat 2: How it works ---------------------------------------- */}
        <section id="how" className={styles.section}>
          <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.sectionHead} ${styles.revealEl}`}>
            <h2 className={styles.h2}>Three steps. <span className={styles.script}>No history to sell.</span></h2>
          </div>
          <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.steps} ${styles.revealEl}`}>
            <div className={styles.step}>
              <span className={`${styles.sticker} ${styles.rot1}`}>Real funds</span>
              <IconTimer />
              <h3>Shield</h3>
              <p>Deposit into the STRK20 privacy pool. Notes are UTXO-style — a note can&apos;t be partially spent, only consumed whole and re-split.</p>
            </div>
            <div className={styles.step}>
              <span className={`${styles.sticker} ${styles.stickerAlt} ${styles.rot3}`}>Unlinkable</span>
              <IconShuffle />
              <h3>Trade from a fresh identity</h3>
              <p>A per-trade execution wallet, generated from your shielded funds, acts on your behalf. Your funding wallet never touches the trade.</p>
            </div>
            <div className={styles.step}>
              <span className={`${styles.sticker} ${styles.rot2}`}>Sealed</span>
              <IconShield />
              <h3>Or launch, sealed-bid</h3>
              <p>New token launches clear through a sealed-bid round — bids are real, escrowed notes, revealed only at settlement. No first-block sniping war.</p>
            </div>
          </div>
        </section>

        {/* --- Beat 3: Proof (mechanics, no invented metrics) --------------- */}
        <section id="markets" className={styles.section}>
          <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.sectionHead} ${styles.revealEl}`}>
            <h2 className={styles.h2}>Two mechanics. <span className={styles.script}>One pool.</span></h2>
          </div>
          <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.markets} ${styles.revealEl}`}>
            <div className={styles.market}>
              <span className={`${styles.sticker} ${styles.rot1} ${styles.marketTag}`}>Spot trading</span>
              <h3>Trade from an unlinkable identity</h3>
              <p>Fund through the pool, trade from a shadow execution wallet. Your position is yours — not a target for whoever&apos;s watching your main wallet.</p>
              <ul className={styles.specList}>
                <li><span>Funding</span><span>STRK20 shield</span></li>
                <li><span>Execution</span><span>Shadow account, per trade</span></li>
              </ul>
            </div>
            <div className={styles.market}>
              <span className={`${styles.sticker} ${styles.stickerAlt} ${styles.rot2} ${styles.marketTag}`}>Fair launches</span>
              <h3>Sealed-bid, not first-block</h3>
              <p>Bids are escrowed as encrypted notes. The round closes on a timer, resolves at once — no one sees the book before it clears.</p>
              <ul className={styles.specList}>
                <li><span>Escrow unit</span><span>Open note</span></li>
                <li><span>Settlement</span><span>InvokeExternal</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* --- App shell: the actual wallet panel ---------------------------- */}
        <section id="app" className={styles.appSection}>
          <div ref={(el) => void (el && revealRefs.current.push(el))} data-reveal className={`${styles.sectionHead} ${styles.revealEl}`}>
            <h2 className={styles.h2}>Try it live.</h2>
            <p className={styles.appSub}>Shield, unshield, and privately transfer, wired to the real STRK20 mainnet pool.</p>
          </div>
          <div className={panelStyles.page} style={{ minHeight: 'auto', padding: '0 0 40px' }}>
            <WalletAccountV6Tag />
          </div>
        </section>
      </main>

      {/* --- Beat 4: Close ------------------------------------------------- */}
      <footer className={styles.footer}>
        <span className={styles.creditStamp}>Cleared on Starknet · STRK20 mainnet pool</span>
        <div className={styles.footerLinks}>
          <a href="https://github.com/codeswithroh/veyl" target="_blank" rel="noreferrer">Repo</a>
          <span className={styles.footerDot}>·</span>
          <span>Built on Starknet.js v10.4.0 + STRK20</span>
        </div>
      </footer>
    </div>
  );
}
