import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            Jettison
          </p>
          <h1 className="font-display text-3xl leading-tight">
            Nothing here.
          </h1>
          <p className="text-secondary text-sm">
            This page doesn&apos;t exist, or it isn&apos;t shared with you.
          </p>
        </header>
        <Link
          href="/"
          className="h-12 rounded-md bg-ember text-ink font-medium flex items-center justify-center hover:opacity-90"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
