/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

/**
 * Converts a bigint to a signed integer with a specified number of bits.
 *
 * @param {bigint} int - The bigint to be converted.
 * @param {number} bits - The bit length to use for the conversion, defaulting to 32 bits.
 * @returns {number} - The resulting signed integer as a number.
 */

export function asIntN(int: bigint, bits = 32) {
    return Number(BigInt.asIntN(bits, BigInt(int)));
}
