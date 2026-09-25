export const d = (sides: number) => Math.floor(Math.random() * sides) + 1;

export const rollPool = (count: number) => Array.from({ length: Math.max(0, count) }, () => d(6));

export const sixes = (dice: number[]) => dice.filter((v) => v === 6).length;

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
