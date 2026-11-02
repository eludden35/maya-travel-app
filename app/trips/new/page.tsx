import type { Metadata } from "next";

import { createTripAction } from "@/app/_actions/trips-actions";
import { TripForm } from "@/app/trips/_components/trip-form";
import { requireProfileFor } from "@/lib/profiles";
import { DEFAULT_TRIP_CURRENCY } from "@/lib/trip-fields";

export const metadata: Metadata = {
  title: "Plan a trip · Jettison",
};

/**
 * Plan a trip (Bead tripplanner-718, test plan S2 step 1). Creates a private
 * trip through `create_trip`; the action redirects to the new trip's page.
 * Private only in UAT-1, so there is no visibility choice (S2-N1).
 */
export default async function NewTripPage() {
  await requireProfileFor("/trips/new");

  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-10 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
            New trip
          </p>
          <h1 className="font-display text-4xl leading-tight">Plan a trip</h1>
          <p className="text-secondary text-sm">
            Start with a name; the rest can wait. Trips are private: only the
            people you invite will see it.
          </p>
        </header>

        <TripForm
          action={createTripAction}
          initialValues={{
            name: "",
            description: "",
            startDate: "",
            endDate: "",
            currency: DEFAULT_TRIP_CURRENCY,
          }}
          currencyEditable
          submitLabel="Create trip"
          pendingLabel="Creating…"
          cancelHref="/"
        />
      </div>
    </main>
  );
}
