/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

import BN from "bn.js";
import { MathUtil, U64_MAX, ZERO } from "./utils";
import { MAX_SQRT_PRICE, MIN_SQRT_PRICE } from "./constants";

export class SwapUtils {
    /**
     * Retrieves the default sqrt price limit for a swap operation.
     *
     * @param a2b - Set to true for an A to B swap, or false for a B to A swap.
     * @returns The default sqrt price limit for the specified swap direction.
     */
    static getDefaultSqrtPriceLimit(a2b: boolean): BN {
        return new BN(a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE);
    }

    /**
     * Retrieves the default values for the otherAmountThreshold parameter in a swap.
     *
     * @param amountSpecifiedIsInput - Indicates the direction of the swap.
     * @returns The default values for the otherAmountThreshold in the swap.
     */
    static getDefaultOtherAmountThreshold(amountSpecifiedIsInput: boolean): BN {
        return amountSpecifiedIsInput ? ZERO : U64_MAX;
    }
}

/**
 * Calculates the lower sqrt price based on the amount of token A.
 *
 * @param amount - The amount of tokens the user wants to swap.
 * @param liquidity - The current pool liquidity.
 * @param sqrtPriceX64 - The pool's current sqrt price.
 * @returns The calculated lower sqrt price (LowesqrtPriceX64).
 */

export function getLowerSqrtPriceFromCoinA(
    amount: BN,
    liquidity: BN,
    sqrtPriceX64: BN
): BN {
    const numerator = liquidity.mul(sqrtPriceX64).shln(64);
    const denominator = liquidity.shln(64).add(amount.mul(sqrtPriceX64));

    // always round up
    return MathUtil.divRoundUp(numerator, denominator);
}

/**
 * Calculates the upper sqrt price based on the amount of token A.
 *
 * @param amount - The amount of tokens the user wants to swap.
 * @param liquidity - The current pool liquidity.
 * @param sqrtPriceX64 - The pool's current sqrt price.
 * @returns The calculated upper sqrt price (UpperSqrtPriceX64).
 */

export function getUpperSqrtPriceFromCoinA(
    amount: BN,
    liquidity: BN,
    sqrtPriceX64: BN
): BN {
    const numerator = liquidity.mul(sqrtPriceX64).shln(64);
    const denominator = liquidity.shln(64).sub(amount.mul(sqrtPriceX64));

    // always round up
    return MathUtil.divRoundUp(numerator, denominator);
}

/**
 * Calculates the lower sqrt price based on the amount of coin B.
 *
 * @param amount - The amount of coins the user wants to swap.
 * @param liquidity - The current pool liquidity.
 * @param sqrtPriceX64 - The pool's current sqrt price.
 * @returns The calculated lower sqrt price (LowerSqrtPriceX64).
 */

export function getLowerSqrtPriceFromCoinB(
    amount: BN,
    liquidity: BN,
    sqrtPriceX64: BN
): BN {
    // always round down(rounding up a negative number)
    return sqrtPriceX64.sub(MathUtil.divRoundUp(amount.shln(64), liquidity));
}

/**
 * Calculates the upper sqrt price based on the amount of coin B.
 *
 * @param amount - The amount of coins the user wants to swap.
 * @param liquidity - The current pool liquidity.
 * @param sqrtPriceX64 - The pool's current sqrt price.
 * @returns The calculated upper sqrt price (UpperSqrtPriceX64).
 */

export function getUpperSqrtPriceFromCoinB(
    amount: BN,
    liquidity: BN,
    sqrtPriceX64: BN
): BN {
    // always round down (rounding up a negative number)
    return sqrtPriceX64.add(amount.shln(64).div(liquidity));
}
