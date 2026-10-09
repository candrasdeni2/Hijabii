import { HttpError } from './auth.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // tanpa 0 O 1 l I

export function generatePassword(len = 12) {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // hindari modulo bias
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < max && out.length < len) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export function checkPassword(p: unknown): string {
  if (typeof p !== 'string' || p.length < 8 || p.length > 72)
    throw new HttpError(422, 'weak_password', 'Password minimal 8 karakter.');
  return p;
}
