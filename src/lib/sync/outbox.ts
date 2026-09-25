import type { Op } from "./ops";

/** Set by the sync client while connected to a shared campaign. */
export const outbox: { send: ((ops: Op[]) => void) | null } = { send: null };
