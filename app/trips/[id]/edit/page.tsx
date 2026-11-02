import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateTripAction } from "@/app/_actions/trips-actions";
import { TripForm } from "@/app/trips/_components/trip-form";
import { requireProfileFor } from "@/lib/profiles";
import { getTripById } from "@/lib/trips";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = {
  title: "Edit trip · Jettison",
};

/**
 * Edit a trip's name, dates and description (Bead tripplanner-718, test plan
 * S2 step 2). Organizer only: anyone else gets the same "not found" as for a
 * trip that doesn't exist. `update_trip` enforces the same rule.
 */
export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfileFor(isUuid(id) ? `/trips/${id}/edit` : "/");

  if (!isUuid(id)) {
    notFound();
  }
  const trip = await getTripById(id);
  if (!trip || trip.organizer_id !== profile.id) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-10 bg-paper text-ink">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary break-words">
            {trip.name}
          </p>
          <h1 className="font-display text-4xl leading-tight">Edit trip</h1>
        </header>

        <TripForm
          action={updateTripAction.bind(null, trip.id)}
          initialValues={{
            name: trip.name,
            description: trip.description ?? "",
            startDate: trip.start_date ?? "",
            endDate: trip.end_date ?? "",
            currency: trip.currency,
          }}
          currencyEditable={false}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          cancelHref={`/trips/${trip.id}`}
        />
      </div>
    </main>
  );
}
