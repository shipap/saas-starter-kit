import { ArrowUpRight } from "lucide-react";

export function RelayMark() {
  return (
    <span className="relay-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Attribution({ compact = false }: { compact?: boolean }) {
  const portfolio = process.env.PUBLIC_PORTFOLIO_URL || "https://bububi.icu";
  const email = process.env.PUBLIC_CONTACT_EMAIL || "work@bububi.icu";
  const source = process.env.PUBLIC_SOURCE_URL;
  return (
    <footer className={`attribution ${compact ? "compact" : ""}`}>
      <span>
        Open-source demo by <strong>bububi</strong>
      </span>
      <nav aria-label="Developer links">
        <a href={portfolio} target="_blank" rel="noreferrer">
          Portfolio <ArrowUpRight size={13} />
        </a>
        <a href={`mailto:${email}`}>
          Need a custom version? <ArrowUpRight size={13} />
        </a>
        {source && (
          <a href={source} target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={13} />
          </a>
        )}
      </nav>
    </footer>
  );
}
