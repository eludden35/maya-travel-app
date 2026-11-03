/** Skeleton while a trip page loads; same frame as the page itself. */
export default function TripLoading() {
  return (
    <main
      aria-busy="true"
      className="flex flex-1 flex-col items-center px-6 pt-6 pb-12 bg-paper"
    >
      <p className="sr-only" role="status">
        Loading trip…
      </p>
      <div
        aria-hidden="true"
        className="w-full max-w-sm flex flex-col gap-8 animate-pulse motion-reduce:animate-none"
      >
        <div className="h-11 w-28 rounded-md bg-card" />
        <div className="flex flex-col gap-3">
          <div className="h-3 w-32 rounded bg-card" />
          <div className="h-10 w-3/4 rounded-md bg-card" />
          <div className="h-4 w-1/2 rounded bg-card" />
        </div>
        <div className="h-48 rounded-2xl bg-card" />
      </div>
    </main>
  );
}
