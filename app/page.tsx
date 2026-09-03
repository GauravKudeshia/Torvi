const languages = ['EN', 'ES', 'FR', 'DE', 'HI'];

export default function Home() {
  return (
    <main className="site-shell">
      <nav className="nav-wrap" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Torvi home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Torvi</span>
        </a>
        <div className="nav-links">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#safety">Trust</a>
        </div>
        <div className="nav-actions">
          <a className="text-button" href="/dashboard">Sign in</a>
          <a className="pill-button pill-button-small" href="/dashboard">Start free</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Real-time conversation intelligence</div>
          <h1>Help during the conversation.<br /><em>Clarity after it.</em></h1>
          <p className="hero-lede">
            Torvi listens with permission, understands what is happening, and gives you useful answers, notes, and next steps while the moment still matters.
          </p>
          <div className="hero-actions">
            <a className="pill-button" href="/dashboard">Start free <span>↗</span></a>
            <a className="ghost-button" href="#product"><span className="play">▶</span> See it in action</a>
          </div>
          <div className="hero-meta">
            <span>No credit card</span>
            <span>Web + desktop</span>
            <span>Consent-first</span>
          </div>
        </div>

        <div className="product-stage" id="product">
          <div className="stage-glow" />
          <div className="session-window">
            <div className="window-topbar">
              <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
              <div className="session-title">
                <span className="live-dot" /> Live meeting · Product launch review
              </div>
              <div className="timer">18:42</div>
            </div>

            <div className="session-body">
              <aside className="session-rail" aria-label="Interview progress">
                <div className="rail-brand">TV</div>
                <button className="rail-button active" aria-label="Live coaching">◉</button>
                <button className="rail-button" aria-label="Transcript">≡</button>
                <button className="rail-button" aria-label="Profile">◎</button>
                <div className="rail-spacer" />
                <button className="rail-button" aria-label="Settings">⌁</button>
              </aside>

              <div className="conversation-panel">
                <div className="panel-label">Live transcript</div>
                <div className="transcript-row interviewer">
                  <span className="speaker-avatar">JM</span>
                  <div>
                    <div className="speaker-line"><b>Jordan</b><span>Product</span></div>
                    <p>What trade-off are we making if we keep the launch date?</p>
                  </div>
                </div>
                <div className="transcript-row candidate faded">
                  <span className="speaker-avatar">YOU</span>
                  <div>
                    <div className="speaker-line"><b>You</b><span>Speaking</span></div>
                    <p>The safest path is to hold the date and narrow the first release...</p>
                  </div>
                </div>
                <div className="listening-line"><span className="sound-bars"><i /><i /><i /><i /></span> Listening</div>
              </div>

              <section className="answer-panel" aria-label="Suggested answer">
                <div className="answer-heading">
                  <div><span className="spark">✦</span><b>Suggested answer</b></div>
                  <span className="grounded">Grounded in your resume</span>
                </div>
                <div className="answer-card">
                  <p>
                    “The trade-off is breadth for confidence. We can hold the launch date if we move two lower-confidence integrations into the next release and confirm an owner for each dependency today.”
                  </p>
                  <div className="answer-points">
                    <span><i>01</i> Name the trade-off</span>
                    <span><i>02</i> Recommend the decision</span>
                    <span><i>03</i> Confirm owners and timing</span>
                  </div>
                </div>
                <div className="coach-note"><span>Context note</span> The product brief marks API readiness as the only launch-blocking risk.</div>
                <div className="answer-actions">
                  <button>Shorter</button><button>More natural</button><button>Action items</button>
                </div>
              </section>
            </div>
          </div>
          <div className="floating-command"><kbd>⌘</kbd><kbd>↵</kbd><span>Ask anything</span><i>✦</i></div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product highlights">
        <p>One discreet workspace for the conversations that move work forward.</p>
        <div className="proof-items">
          <span>Meetings</span><span>Interviews</span><span>Sales</span><span>Presentations</span><span>Study</span><span>General</span>
        </div>
        <div className="language-row" aria-label="Supported languages">
          {languages.map((language) => <span key={language}>{language}</span>)}
        </div>
      </section>

      <section className="feature-grid product-story" id="how-it-works">
        <article className="feature-intro">
          <span className="section-kicker">How Torvi helps</span>
          <h2>Stay in the room.<br />Torvi keeps up.</h2>
          <p>It listens to the conversation you start, understands the visible context you allow, and keeps the most useful next response close at hand.</p>
        </article>
        <article className="feature-card feature-card-dark">
          <span className="feature-number">Before</span>
          <h3>Bring only the context that matters</h3>
          <p>Add an agenda, brief, notes, resume, or job description. Torvi shows exactly what is attached before listening begins.</p>
          <div className="context-stack" aria-hidden="true">
            <span><b>Launch brief.pdf</b><small>Ready</small></span>
            <span><b>Meeting agenda</b><small>Ready</small></span>
            <span><b>Professional memory</b><small>2 approved facts</small></span>
          </div>
        </article>
        <article className="feature-card">
          <span className="feature-number">During</span>
          <h3>Get help in your speaking style</h3>
          <p>Start with quick cues or use a natural paragraph. Change the depth without losing the thread of the conversation.</p>
          <div className="format-demo" aria-label="Response formats">
            <div><span className="format-tab active">Points</span><span className="format-tab">Paragraph</span><span className="format-tab">Adaptive</span></div>
            <p><i>01</i> State the decision clearly</p><p><i>02</i> Name the trade-off</p><p><i>03</i> Confirm the next owner</p>
          </div>
        </article>
        <article className="feature-card feature-card-blue">
          <span className="feature-number">After</span>
          <h3>Leave with the follow-through</h3>
          <p>Save only when you choose. Review the transcript, decisions, action items, and an editable follow-up draft.</p>
          <div className="notes-demo" aria-label="Generated meeting notes">
            <strong>Product launch review</strong>
            <span><i /> Decision: protect the date by narrowing scope</span>
            <span><i /> Jordan owns the readiness review by Tuesday</span>
            <span><i /> Send the revised plan before 3:00 PM</span>
          </div>
        </article>
      </section>

      <section className="career-suite-section">
        <div className="career-suite-heading"><span className="section-kicker">A complete conversation workspace</span><h2>Everything around the moment, connected.</h2><p>Prepare the context, get help while the conversation is happening, and leave with useful follow-through.</p></div>
        <div className="career-suite-grid">
          <article><span>01</span><h3>Live answers</h3><p>Fast, streaming responses that use the current question, recent conversation, session mode, and selected sources.</p></article>
          <article><span>02</span><h3>Points or paragraphs</h3><p>Choose short conversational cues, a natural spoken response, or let the assistant select the clearest shape.</p></article>
          <article><span>03</span><h3>Real-time transcript</h3><p>Separate laptop audio and microphone channels with visible listening, pause, and stop controls.</p></article>
          <article><span>04</span><h3>Private knowledge packs</h3><p>Attach agendas, briefs, notes, sales material, research, or interview documents to ground the session.</p></article>
          <article><span>05</span><h3>Notes + follow-through</h3><p>Save a transcript, summary, decisions, action items, and an editable follow-up only when you choose.</p></article>
          <article><span>06</span><h3>Desktop overlay</h3><p>Move between standard, compact, and minimal views while keeping listening and privacy status unmistakable.</p></article>
        </div>
        <a className="pill-button" href="/tools">Explore the toolkit <span>↗</span></a>
      </section>

      <section className="visibility-section" id="safety">
        <div className="visibility-heading">
          <span className="section-kicker">You control the presence</span>
          <h2>Visible when you want it.<br />Discreet when you need focus.</h2>
          <p>Choose a standard window for collaborative sessions or a share-aware private overlay for personal guidance. Torvi always keeps listening, capture, and consent status visible to you.</p>
        </div>
        <div className="visibility-grid">
          <article>
            <div className="visibility-preview standard-preview"><span>Visible to you</span><div className="mini-assistant"><b>✦ Suggested response</b><p>Lead with the decision, then name the trade-off.</p></div></div>
            <h3>Standard mode</h3><p>A conventional Torvi window for preparation, practice, shared reviews, and meeting notes.</p>
          </article>
          <article>
            <div className="visibility-preview private-preview"><span>Private overlay</span><div className="mini-assistant"><b>✦ Ask anything</b><p>Move, resize, dim, or hide the assistant with a shortcut.</p></div></div>
            <h3>Share-aware overlay</h3><p>A focused overlay designed to stay out of supported screen-sharing captures. Results vary by capture method, so always confirm before sharing.</p>
          </article>
        </div>
      </section>

      <section className="trust-section">
        <div>
          <span className="section-kicker">Consent and control</span>
          <h2>Your conversation stays yours.</h2>
        </div>
        <div className="trust-copy">
          <p>Torvi makes the listening state obvious, keeps screen context optional, and asks what to do with the transcript when a session ends.</p>
          <div className="trust-list">
            <span>Explicit consent</span><span>Transient audio processing</span><span>One-click discard</span><span>Export + delete controls</span>
          </div>
        </div>
      </section>

      <section className="transcription-section">
        <div className="transcription-card" aria-label="Live transcript example">
          <div><span>Jordan · Product</span><time>10:42</time></div><p>Can we keep the launch date without increasing operational risk?</p>
          <div><span>You</span><time>10:42</time></div><p>Yes, if we narrow scope and confirm the integration owner today.</p>
          <div className="transcript-listening"><i /><i /><i /><i /><i /> Listening</div>
        </div>
        <div className="transcription-copy"><span className="section-kicker">Live transcription</span><h2>Two sides of the conversation. One clear record.</h2><p>Torvi separates system audio and microphone audio, streams the transcript as the session happens, and supports English, Spanish, French, German, and Hindi at launch.</p><div><strong>2</strong><span>separate audio channels</span><strong>5</strong><span>launch languages</span><strong>1</strong><span>explicit save decision</span></div></div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="pricing-heading">
          <span className="section-kicker">Simple pricing</span>
          <h2>Practice free. Go live when it counts.</h2>
        </div>
        <div className="price-cards">
          <article className="price-card">
            <span>Free</span><h3>$0</h3><p>3 mock sessions and 15 live minutes every month.</p>
            <a className="ghost-plan" href="/dashboard">Start free</a>
          </article>
          <article className="price-card pro-card">
            <span>Pro</span><div className="best-value">Most focused</div><h3>$19.99<small>/month</small></h3>
            <p>300 live minutes, unlimited mock practice subject to fair use, every mode and language.</p>
            <a className="pill-button" href="/pricing">Choose Pro <span>↗</span></a>
          </article>
        </div>
      </section>

      <section className="faq-section">
        <div><span className="section-kicker">Frequently asked questions</span><h2>A few useful answers before you begin.</h2></div>
        <div className="faq-list">
          <details><summary>How is Torvi different from a regular AI notetaker?</summary><p>A notetaker is mostly useful after a call. Torvi can also help during the conversation with a response, explanation, follow-up question, or recap grounded in the context you selected.</p></details>
          <details><summary>Can I choose points instead of paragraphs?</summary><p>Yes. Use short points for glanceable speaking cues, a natural paragraph for a fuller response, or Adaptive mode to let Torvi choose the clearest shape for the moment.</p></details>
          <details><summary>Does Torvi join my meetings as a bot?</summary><p>No. The desktop app captures the audio channels you explicitly enable on your device. It does not add another participant to the call.</p></details>
          <details><summary>Is the private overlay guaranteed to be hidden?</summary><p>No capture method can be promised universally. Torvi is designed to stay out of supported share and recording paths, but you should verify your exact setup before presenting.</p></details>
          <details><summary>What happens to my transcript?</summary><p>You decide at the end of each session whether to save or discard it. Saved sessions can be reviewed, exported, and deleted from History.</p></details>
          <details><summary>Where can I use Torvi?</summary><p>The full workspace runs on the web. The native desktop app provides system-audio capture and the floating assistant. The mobile companion supports preparation and foreground room coaching.</p></details>
        </div>
      </section>

      <section className="download-cta">
        <div><span className="section-kicker light">Start with the web workspace</span><h2>Bring Torvi to your next conversation.</h2><p>Prepare online, then use the native desktop assistant when you need system audio and a movable overlay.</p></div>
        <a className="pill-button" href="/downloads">See all downloads <span>↗</span></a>
      </section>

      <footer className="site-footer">
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Torvi</span></a>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/downloads">Downloads</a></div>
        <p>Original consent-first conversation assistance software. Use only with permission.</p>
      </footer>
    </main>
  );
}
