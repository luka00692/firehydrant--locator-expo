// Local, educational password-hashing/cracking demo.
//
// Everything here operates only on a password/hash you type in yourself —
// there is no network call and no way to point this at someone else's
// account or a live system. The goal is to make the difference between
// weak hashing (MD5/SHA-1/SHA-256, cracked in a blink) and slow, salted
// hashing (bcrypt) visible.

import CryptoJS from 'crypto-js';
import bcrypt from 'bcryptjs';

export const ALGORITHMS = ['md5', 'sha1', 'sha256', 'bcrypt'];

export const ALGORITHM_LABELS = {
  md5: 'MD5 (broken, unsalted)',
  sha1: 'SHA-1 (broken, unsalted)',
  sha256: 'SHA-256 (fast, unsalted)',
  bcrypt: 'bcrypt (slow, salted)'
};

// Small built-in list of the most common real-world passwords, used only
// as a dictionary against hashes generated on this screen.
const COMMON_PASSWORDS = [
  '123456', 'password', '123456789', '12345678', '12345', 'qwerty',
  'abc123', 'password1', '111111', '123123', 'admin', 'letmein',
  'welcome', 'monkey', 'dragon', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'trustno1', 'superman', 'shadow', 'master',
  'hello', 'freedom', 'whatever', 'qazwsx', 'passw0rd', 'starwars',
  'ninja', 'mustang', 'access', 'flower', 'hottie', 'loveme', 'jordan',
  'harley', 'ranger', 'buster', 'soccer', 'hockey', 'killer', 'george',
  'sexy', 'andrew', 'charlie', 'daniel', 'michael', 'jennifer', 'letmein1'
];

export function hashPassword(password, algorithm) {
  switch (algorithm) {
    case 'md5':
      return CryptoJS.MD5(password).toString();
    case 'sha1':
      return CryptoJS.SHA1(password).toString();
    case 'sha256':
      return CryptoJS.SHA256(password).toString();
    case 'bcrypt':
      return bcrypt.hashSync(password, 10);
    default:
      throw new Error(`Unknown algorithm: ${algorithm}`);
  }
}

function fastHashMatches(candidate, algorithm, targetHash) {
  if (algorithm === 'md5') return CryptoJS.MD5(candidate).toString() === targetHash;
  if (algorithm === 'sha1') return CryptoJS.SHA1(candidate).toString() === targetHash;
  if (algorithm === 'sha256') return CryptoJS.SHA256(candidate).toString() === targetHash;
  return false;
}

const LOWER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const MAX_BRUTE_FORCE_LENGTH = 4; // keeps the demo fast; longer = combinatorial blowup

function* bruteForceCandidates(maxLength) {
  for (let length = 1; length <= maxLength; length++) {
    const indices = new Array(length).fill(0);
    while (true) {
      yield indices.map((i) => LOWER_ALPHABET[i]).join('');
      let pos = length - 1;
      while (pos >= 0) {
        indices[pos]++;
        if (indices[pos] < LOWER_ALPHABET.length) break;
        indices[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
  }
}

// Attempts a dictionary attack (and, for fast hashes, a bounded brute force
// over lowercase letters) against a hash produced by hashPassword() above.
// Returns { cracked, guess, attempts, elapsedMs }.
export function crackHash(targetHash, algorithm) {
  const startedAt = Date.now();
  let attempts = 0;

  for (const word of COMMON_PASSWORDS) {
    attempts++;
    const matches =
      algorithm === 'bcrypt' ? bcrypt.compareSync(word, targetHash) : fastHashMatches(word, algorithm, targetHash);
    if (matches) {
      return { cracked: true, guess: word, attempts, elapsedMs: Date.now() - startedAt };
    }
  }

  // Brute force is only feasible here for fast, unsalted hashes — bcrypt's
  // deliberate slowness makes even a 4-character brute force impractical
  // in a UI thread demo, which is itself the point.
  if (algorithm !== 'bcrypt') {
    for (const candidate of bruteForceCandidates(MAX_BRUTE_FORCE_LENGTH)) {
      attempts++;
      if (fastHashMatches(candidate, algorithm, targetHash)) {
        return { cracked: true, guess: candidate, attempts, elapsedMs: Date.now() - startedAt };
      }
    }
  }

  return { cracked: false, guess: null, attempts, elapsedMs: Date.now() - startedAt };
}
