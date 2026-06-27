import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <div className="hero">
        <span className="tag" style={{ color: "var(--accent)", fontSize: 12 }}>
          ONE PHILOSOPHY, TWO SURFACES
        </span>
        <h1>Make the opaque legible.</h1>
        <p>
          A Firecrawl operation that fails or under-delivers usually comes back as one
          black box: a single error, or one ranked list with no idea why. These two
          surfaces turn that black box into a <strong>trace</strong> — every stage and
          every result, with the reason it&apos;s there and what to do next.
        </p>
      </div>

      <div className="cards">
        <Link href="/search" className="card">
          <span className="tag">SEARCH</span>
          <h3>Retrieval, made observable</h3>
          <p className="muted">
            Expand → federate → fuse (RRF) → dedup → rerank → diversify (MMR). Recall and
            precision you can see, with per-result provenance and a coverage panel.
          </p>
        </Link>
        <Link href="/flows" className="card">
          <span className="tag">FLOWS</span>
          <h3>Browser automations, made debuggable</h3>
          <p className="muted">
            A multi-step browser flow that breaks tells you exactly which step failed,
            why, and what the page looked like — not one opaque SCRAPE_FAILED.
          </p>
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        Press <span className="kbd">⌘K</span> anywhere to search results, jump, or toggle
        settings.
      </p>
    </main>
  );
}
