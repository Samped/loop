import Image from "next/image";

export default function AgentPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
      <div className="flex w-full flex-col items-center gap-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-10 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-10 sm:px-10 sm:py-12 sm:text-left">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden sm:h-28 sm:w-28">
          <Image
            src="/loop.png"
            alt="Loop"
            width={794}
            height={1123}
            priority
            className="absolute left-1/2 top-[92%] w-[210%] max-w-none -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        <div className="text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/80">Loop</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            Trustless agent coming soon
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
            Autonomous on-chain trading assistant. No custodians, no blind trust.
          </p>
        </div>
      </div>
    </div>
  );
}
