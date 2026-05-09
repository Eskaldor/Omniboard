import type { SessionMeta } from '../types';

/** Пас от GM на броски вне хода до конца текущего раунда (см. session.actor_out_of_turn_round_pass). */
export function hasActorRoundOutOfTurnPass(
  session: Pick<SessionMeta, 'actor_out_of_turn_round_pass'> | undefined,
  combatRound: number | undefined,
  actorId: string | null | undefined,
): boolean {
  if (actorId == null || combatRound == null || !Number.isFinite(Number(combatRound))) return false;
  const map = session?.actor_out_of_turn_round_pass;
  if (!map) return false;
  return map[actorId] === Number(combatRound);
}
