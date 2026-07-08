import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

// scrypt cost parameters — N (CPU/memory cost) is the main knob. 2^17 takes roughly
// 100-200ms on typical hardware, which is deliberately slow enough to make brute-forcing
// stolen hashes expensive without making every login noticeably slow.
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const SCRYPT_OPTIONS: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 };

// util.promisify loses the (password, salt, keylen, options, callback) overload, so wrap
// it manually instead.
const scrypt = (password: string, salt: Buffer, keylen: number): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        scryptCallback(password, salt, keylen, SCRYPT_OPTIONS, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
        });
    });

// Stored format: "scrypt$<saltHex>$<hashHex>" — versioned prefix so the KDF/params can be
// changed later without invalidating every existing password (old hashes keep verifying
// with the old params; only re-hash-on-login would need adding for a live migration).
const PREFIX = "scrypt";

export const hashPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    return `${PREFIX}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== PREFIX) return false;

    const [, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");

    const derivedKey = await scrypt(password, salt, expected.length);

    // timingSafeEqual throws if lengths differ rather than returning false — guard explicitly
    // so a malformed/truncated stored hash can't leak timing information either.
    if (derivedKey.length !== expected.length) return false;
    return timingSafeEqual(derivedKey, expected);
};
