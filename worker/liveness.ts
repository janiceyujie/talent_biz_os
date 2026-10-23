import { EventEmitter } from "node:events";
import type { WorkerEvents } from "graphile-worker";
import { beat, BEAT_MS, forget, REAP_MS, reapSilent } from "@/lib/queue/heartbeat";
import { log } from "@/lib/log";

// This worker's heartbeat, and releasing the jobs of workers that stopped
// (lib/queue/heartbeat.ts). Graphile names the worker pool when it starts;
// the jobs it locks carry that name, so that's what the heartbeat records.

export function liveness() {
  const events = new EventEmitter() as WorkerEvents;
  const pools = new Set<string>();
  const quietly = (what: string) => (e: unknown) => log.error("worker.liveness.failed", { reason: what, error: e });
  events.on("pool:create", ({ workerPool }) => {
    pools.add(workerPool.id);
    beat(workerPool.id).catch(quietly("beat"));
  });
  const beating = setInterval(() => pools.forEach((id) => beat(id).catch(quietly("beat"))), BEAT_MS);
  const reaping = setInterval(
    () =>
      reapSilent().then(
        (dead) => dead.length && log.warn("worker.liveness.released", { count: dead.length }),
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
