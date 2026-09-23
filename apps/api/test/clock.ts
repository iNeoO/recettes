import { Clock, Duration, Effect, Layer, MutableRef } from "effect"

/**
 * Une horloge réelle décalée d'un offset que le test fait varier. Seule la
 * lecture de l'heure est décalée : sleep reste réel, le serveur HTTP en dépend.
 */
const offset = MutableRef.make(0)
const real = Clock.make()

const shifted: Clock.Clock = {
  [Clock.ClockTypeId]: Clock.ClockTypeId,
  unsafeCurrentTimeMillis: () => real.unsafeCurrentTimeMillis() + MutableRef.get(offset),
  currentTimeMillis: Effect.sync(() => real.unsafeCurrentTimeMillis() + MutableRef.get(offset)),
  unsafeCurrentTimeNanos: () =>
    real.unsafeCurrentTimeNanos() + BigInt(MutableRef.get(offset)) * 1_000_000n,
  currentTimeNanos: Effect.sync(
    () => real.unsafeCurrentTimeNanos() + BigInt(MutableRef.get(offset)) * 1_000_000n
  ),
  sleep: (duration) => real.sleep(duration),
}

/** À fournir au serveur : ses fibres héritent de cette horloge. */
export const ShiftedClock = Layer.setClock(shifted)

export const advanceClock = (duration: Duration.DurationInput) =>
  Effect.sync(() => MutableRef.update(offset, (ms) => ms + Duration.toMillis(duration)))

export const resetClock = Effect.sync(() => MutableRef.set(offset, 0))
