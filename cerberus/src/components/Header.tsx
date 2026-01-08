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
        <WalletConnector />
      </div>
    </header>
  );
}
