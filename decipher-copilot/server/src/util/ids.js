import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid() {
  const time = Date.now();
  let str = '';

  // Timestamp (10 chars)
  let t = time;
  for (let i = 9; i >= 0; i--) {
    str = ENCODING[t % 32] + str;
    t = Math.floor(t / 32);
  }

  // Randomness (16 chars)
  const bytes = randomBytes(10);
  for (let i = 0; i < 10; i++) {
    str += ENCODING[bytes[i] % 32];
  }

  return str;
}
