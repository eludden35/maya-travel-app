import Link from "next/link";

import { DataAccessError } from "@/lib/errors";
import { countOpenReports } from "@/lib/reports";

/**
 * The moderators' way into /admin/reports from home, with the open count
 * (Bead tripplanner-2o5.6). Home renders it for moderators only. UAT-1 has no
 * alerts, so this is where the founder sees that something is waiting.
 */
export async function ModeratorLink() {
  let open: number | null = null;
  try {
    open = await countOpenReports();
  } catch (error) {
    // Home still works; the link just goes without its count.
    if (!(error instanceof DataAccessError)) {
      throw error;
    }
    console.error(error);
  }

  return (
    <Link
      href="/admin/reports"
      className="self-center inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-hairline bg-card font-mono text-xs uppercase tracking-[0.15em] text-secondary hover:text-ink"
    >
      Reports{" "}
      {open === null ? null : (
        <span className="text-ink tabular-nums">· {open} open</span>
      )}
    </Link>
  );
}
