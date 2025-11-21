// src/utils/generateId.ts
const MAX_COUNTER = 1_000_000;
let counter = 0;

export function generateId(): string {
  counter = (counter + 1) % MAX_COUNTER;

  const rand = Math.floor(Math.random() * MAX_COUNTER);

  const counterPart = counter.toString().padStart(6, '0');
  const randomPart = rand.toString().padStart(6, '0');

  return `${counterPart}${randomPart}`;
}

