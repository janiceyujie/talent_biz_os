import { EventEmitter } from "node:events";
import type { WorkerEvents } from "graphile-worker";
import { beat, BEAT_MS, forget, REAP_MS, reapSilent } from "@/lib/queue/heartbeat";

// This worker's heartbeat, and releasing the jobs of workers that stopped
// (lib/queue/heartbeat.ts). Graphile names the worker pool when it starts;
// the jobs it locks carry that name, so that's what the heartbeat records.

export function liveness() {
  const events = new EventEmitter() as WorkerEvents;
  const pools = new Set<string>();
  // Ids and counts only.
  const quietly = (what: string) => (e: unknown) => console.error(`worker liveness: ${what} failed`, (e as Error)?.name);
  events.on("pool:create", ({ workerPool }) => {
    pools.add(workerPool.id);
    beat(workerPool.id).catch(quietly("beat"));
  });
  const beating = setInterval(() => pools.forEach((id) => beat(id).catch(quietly("beat"))), BEAT_MS);
  const reaping = setInterval(
    () =>
      reapSilent().then(
        (dead) => dead.length && console.log("worker liveness: released the jobs of stopped workers", dead),
        quietly("release"),
      ),
    REAP_MS,
  );
  return {
    events,
    stop: async () => {
      clearInterval(beating);
      clearInterval(reaping);
      await Promise.all([...pools].map((id) => forget(id).catch(quietly("forget"))));
    },
  };
}
