"use client";

import { useSyncExternalStore } from "react";

import { dayNumber, formatPostTime, parsePostTime } from "@/lib/post-time";

/**
 * When a note or report was written, in the reader's time zone (Bead
 * tripplanner-2o5.6). The server can't know the zone, so it renders the time
 * in full, in UTC; the browser swaps in "Today, 9:12 AM" as it hydrates.
 */
export function PostTime({ createdAt }: { createdAt: string }) {
  const clock = useSyncExternalStore(subscribe, readClock, readServerClock);
  const [timeZone, today] = clock.split("|");

  return (
    <time dateTime={parsePostTime(createdAt).toISOString()}>
      {formatPostTime(createdAt, timeZone, today === "" ? null : Number(today))}
    </time>
  );
}

// The reader's time zone and today's date, as one string so React can
// compare snapshots. Nothing announces a change; the next render picks it up.
function readClock(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  return `${timeZone}|${dayNumber(new Date(), timeZone)}`;
}

function readServerClock(): string {
  return "UTC|";
}

function subscribe(): () => void {
  return () => {};
}
