import { WalletConnector } from "@/components/WalletConnector";

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-white/80" />
          <span className="text-sm font-medium tracking-wide text-white/90">
            Cerberus
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 backdrop-blur hover:bg-white/15"
            aria-label="Open admin"
            title="Admin"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
              <path d="M9.5 12l1.7 1.7L14.8 10" />
            </svg>
          </a>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 backdrop-blur hover:bg-white/15"
            aria-label="Open a new user in a new tab"
            title="New user (new tab)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
              <path d="M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
            </svg>
          </a>

          <WalletConnector />
        </div>
      </div>
    </header>
  );
}
