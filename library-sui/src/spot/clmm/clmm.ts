/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

import BN from "bn.js";
import { TickMath } from "./tick";
import { MathUtil, ONE, U64_MAX, ZERO } from "./utils";
import { ClmmpoolsError, CoinErrorCode, MathErrorCode } from "./errors";
import { FEE_RATE_DENOMINATOR, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from "./constants";
import Decimal from "./decimal";
import { d } from "./number";

export type SwapStepResult = {
    amountIn: BN;
    amountOut: BN;
    nextSqrtPrice: BN;
    feeAmount: BN;
};

export type SwapResult = {
    amountIn: BN;
    amountOut: BN;
    feeAmount: BN;
    refAmount: BN;
    nextSqrtPrice: BN;
    crossTickNum: number;
};

export type CoinAmounts = {
    coinA: BN;
    coinB: BN;
};

export function toCoinAmount(a: number, b: number): CoinAmounts {
    return {
        coinA: new BN(a.toString()),
        coinB: new BN(b.toString())
    };
}

/**
 * Represents input data for adding liquidity to a pool.
 */
export type LiquidityInput = {
    coinAmount: BN;
    coinAmountA: BN;
    coinAmountB: BN;
    tokenMaxA: BN;
    tokenMaxB: BN;
    liquidityAmount: BN;
    fix_amount_a: boolean;
};

/**
 * Calculates the change in amount A between two prices based on a given amount of liquidity.
 * The formula is `delta_a = (liquidity * delta_sqrt_price) / (sqrt_price_upper * sqrt_price_lower)`
 *
 * @param sqrtPrice0 - The first sqrt price
 * @param sqrtPrice1 - The second sqrt price
 * @param liquidity - The available liquidity to use
 * @param roundUp - Flag to indicate whether to round the result up or down
 * @returns
 */
export function getDeltaA(
    sqrtPrice0: BN,
    sqrtPrice1: BN,
    liquidity: BN,
    roundUp: boolean
): BN {
    const sqrtPriceDiff = sqrtPrice0.gt(sqrtPrice1)
        ? sqrtPrice0.sub(sqrtPrice1)
        : sqrtPrice1.sub(sqrtPrice0);
    const numerator = liquidity.mul(sqrtPriceDiff).shln(64);
    const denominator = sqrtPrice0.mul(sqrtPrice1);
    const quotient = numerator.div(denominator);
    const remainder = numerator.mod(denominator);
    const result = roundUp && !remainder.eq(ZERO) ? quotient.add(new BN(1)) : quotient;
    return result;
}

/**
 * Computes the change in amount B between two prices for a given liquidity amount.
 * The formula used is `delta_a = (liquidity * delta_sqrt_price) / (sqrt_price_upper * sqrt_price_lower)`
 *
 * @param sqrtPrice0 - The first sqrt price
 * @param sqrtPrice1 - The second sqrt price
 * @param liquidity - The amount of available liquidity
 * @param roundUp - Determines if the result should be rounded up or down
 * @returns
 */

export function getDeltaB(
    sqrtPrice0: BN,
    sqrtPrice1: BN,
    liquidity: BN,
    roundUp: boolean
): BN {
    const sqrtPriceDiff = sqrtPrice0.gt(sqrtPrice1)
        ? sqrtPrice0.sub(sqrtPrice1)
        : sqrtPrice1.sub(sqrtPrice0);
    if (liquidity.eq(ZERO) || sqrtPriceDiff.eq(ZERO)) {
        return ZERO;
    }
    const p = liquidity.mul(sqrtPriceDiff);
    const shoudRoundUp = roundUp && p.and(U64_MAX).gt(ZERO);
    const result = shoudRoundUp ? p.shrn(64).add(ONE) : p.shrn(64);
    if (MathUtil.isOverflow(result, 64)) {
        throw new ClmmpoolsError(
            "Result exceeds the maximum value allowed by u64",
            MathErrorCode.IntegerDowncastOverflow
        );
    }
    return result;
}

/**
 * Calculates the next sqrt price based on a delta of token_a.
 * The formula is `new_sqrt_price = (sqrt_price * liquidity) / (liquidity +/- amount * sqrt_price)`
 *
 * @param sqrtPrice - The initial sqrt price
 * @param liquidity - The available liquidity
 * @param amount - The amount of token_a involved
 * @param byAmountIn - Determines whether the input is fixed
 */

export function getNextSqrtPriceAUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN,
    byAmountIn: boolean
): BN {
    if (amount.eq(ZERO)) {
        return sqrtPrice;
    }
    const numerator = MathUtil.checkMulShiftLeft(sqrtPrice, liquidity, 64, 256);
    const liquidityShl64 = liquidity.shln(64);
    const product = MathUtil.checkMul(sqrtPrice, amount, 256);
    if (!byAmountIn && liquidityShl64.lte(product)) {
        throw new ClmmpoolsError(
            "getNextSqrtPriceAUp - Division of liquidityShl64 by product failed",
            MathErrorCode.DivideByZero
        );
    }
    const nextSqrtPrice = byAmountIn
        ? MathUtil.checkDivRoundUpIf(numerator, liquidityShl64.add(product), true)
        : MathUtil.checkDivRoundUpIf(numerator, liquidityShl64.sub(product), true);
    if (nextSqrtPrice.lt(new BN(MIN_SQRT_PRICE))) {
        throw new ClmmpoolsError(
            "getNextSqrtPriceAUp - The calculated next sqrt price is lower than the minimum allowed sqrt price",
            CoinErrorCode.CoinAmountMinSubceeded
        );
    }
    if (nextSqrtPrice.gt(new BN(MAX_SQRT_PRICE))) {
        throw new ClmmpoolsError(
            "getNextSqrtPriceAUp - The calculated next sqrt price exceeds the maximum allowed sqrt price",
            CoinErrorCode.CoinAmountMaxExceeded
        );
    }

    return nextSqrtPrice;
}

/**
 * Calculates the next sqrt price based on a delta of token_b.
 * The formula is `new_sqrt_price = (sqrt_price + (delta_b / liquidity))`
 *
 * @param sqrtPrice - The initial sqrt price
 * @param liquidity - The available liquidity
 * @param amount - The amount of token_b involved
 * @param byAmountIn - Indicates whether the input is fixed
 */

export function getNextSqrtPriceBDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN,
    byAmountIn: boolean
): BN {
    const deltaSqrtPrice = MathUtil.checkDivRoundUpIf(
        amount.shln(64),
        liquidity,
        !byAmountIn
    );
    const nextSqrtPrice = byAmountIn
        ? sqrtPrice.add(deltaSqrtPrice)
        : sqrtPrice.sub(deltaSqrtPrice);

    if (
        nextSqrtPrice.lt(new BN(MIN_SQRT_PRICE)) ||
        nextSqrtPrice.gt(new BN(MAX_SQRT_PRICE))
    ) {
        throw new ClmmpoolsError(
            "getNextSqrtPriceAUp - The calculated next sqrt price is out of bounds",
            CoinErrorCode.SqrtPriceOutOfBounds
        );
    }

    return nextSqrtPrice;
}

/**
 * Calculates the next sqrt price based on the provided parameters.
 *
 * @param sqrtPrice - The current sqrt price
 * @param liquidity - The available liquidity
 * @param amount - The token amount involved
 * @param aToB - A flag indicating if the calculation is from token_a to token_b
 * @returns
 */
export function getNextSqrtPriceFromInput(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN,
    aToB: boolean
): BN {
    return aToB
        ? getNextSqrtPriceAUp(sqrtPrice, liquidity, amount, true)
        : getNextSqrtPriceBDown(sqrtPrice, liquidity, amount, true);
}

/**
 * Calculates the next sqrt price based on the output parameters.
 *
 * @param sqrtPrice - The current sqrt price
 * @param liquidity - The available liquidity
 * @param amount - The token amount involved
 * @param a2b - A flag indicating if the operation is from token_a to token_b
 * @returns
 */
export function getNextSqrtPriceFromOutput(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN,
    a2b: boolean
): BN {
    return a2b
        ? getNextSqrtPriceBDown(sqrtPrice, liquidity, amount, false)
        : getNextSqrtPriceAUp(sqrtPrice, liquidity, amount, false);
}

/**
 * Calculates the amount of delta_a or delta_b based on the input parameters, rounding the result up.
 *
 * @param currentSqrtPrice - The current sqrt price
 * @param targetSqrtPrice - The target sqrt price
 * @param liquidity - The available liquidity
 * @param a2b - A flag indicating if the calculation is from token_a to token_b
 * @returns
 */

export function getDeltaUpFromInput(
    currentSqrtPrice: BN,
    targetSqrtPrice: BN,
    liquidity: BN,
    a2b: boolean
): BN {
    const sqrtPriceDiff = currentSqrtPrice.gt(targetSqrtPrice)
        ? currentSqrtPrice.sub(targetSqrtPrice)
        : targetSqrtPrice.sub(currentSqrtPrice);

    if (liquidity.lte(ZERO) || sqrtPriceDiff.eq(ZERO)) {
        return ZERO;
    }

    let result;
    if (a2b) {
        const numerator = new BN(liquidity).mul(new BN(sqrtPriceDiff)).shln(64);
        const denominator = targetSqrtPrice.mul(currentSqrtPrice);
        const quotient = numerator.div(denominator);
        const remainder = numerator.mod(denominator);
        result = !remainder.eq(ZERO) ? quotient.add(ONE) : quotient;
    } else {
        const product = new BN(liquidity).mul(new BN(sqrtPriceDiff));
        const shoudRoundUp = product.and(U64_MAX).gt(ZERO);
        result = shoudRoundUp ? product.shrn(64).add(ONE) : product.shrn(64);
    }
    return result;
}

/**
 * Calculates the amount of delta_a or delta_b based on the output parameters, rounding the result down.
 *
 * @param currentSqrtPrice - The current sqrt price
 * @param targetSqrtPrice - The target sqrt price
 * @param liquidity - The available liquidity
 * @param a2b - A flag indicating if the operation is from token_a to token_b
 * @returns
 */

export function getDeltaDownFromOutput(
    currentSqrtPrice: BN,
    targetSqrtPrice: BN,
    liquidity: BN,
    a2b: boolean
): BN {
    const sqrtPriceDiff = currentSqrtPrice.gt(targetSqrtPrice)
        ? currentSqrtPrice.sub(targetSqrtPrice)
        : targetSqrtPrice.sub(currentSqrtPrice);

    if (liquidity.lte(ZERO) || sqrtPriceDiff.eq(ZERO)) {
        return ZERO;
    }

    let result;
    if (a2b) {
        const product = liquidity.mul(sqrtPriceDiff);
        result = product.shrn(64);
    } else {
        const numerator = liquidity.mul(sqrtPriceDiff).shln(64);
        const denominator = targetSqrtPrice.mul(currentSqrtPrice);
        result = numerator.div(denominator);
    }
    return result;
}

/**
 * Simulates each step of a swap for every tick.
 *
 * @param currentSqrtPrice - The current sqrt price
 * @param targetSqrtPrice - The target sqrt price
 * @param liquidity - The available liquidity
 * @param amount - The token amount involved
 * @param feeRate - The applied fee rate for the swap
 * @param byAmountIn - Indicates whether the input amount is fixed
 * @returns
 */

export function computeSwapStep(
    currentSqrtPrice: BN,
    targetSqrtPrice: BN,
    liquidity: BN,
    amount: BN,
    feeRate: BN,
    byAmountIn: boolean
): SwapStepResult {
    if (liquidity === ZERO) {
        return {
            amountIn: ZERO,
            amountOut: ZERO,
            nextSqrtPrice: targetSqrtPrice,
            feeAmount: ZERO
        };
    }
    const a2b = currentSqrtPrice.gte(targetSqrtPrice);
    let amountIn: BN;
    let amountOut: BN;
    let nextSqrtPrice: BN;
    let feeAmount: BN;
    if (byAmountIn) {
        const amountRemain = MathUtil.checkMulDivFloor(
            amount,
            MathUtil.checkUnsignedSub(FEE_RATE_DENOMINATOR, feeRate),
            FEE_RATE_DENOMINATOR,
            64
        );
        const maxAmountIn = getDeltaUpFromInput(
            currentSqrtPrice,
            targetSqrtPrice,
            liquidity,
            a2b
        );
        if (maxAmountIn.gt(amountRemain)) {
            amountIn = amountRemain;
            feeAmount = MathUtil.checkUnsignedSub(amount, amountRemain);
            nextSqrtPrice = getNextSqrtPriceFromInput(
                currentSqrtPrice,
                liquidity,
                amountRemain,
                a2b
            );
        } else {
            amountIn = maxAmountIn;
            feeAmount = MathUtil.checkMulDivCeil(
                amountIn,
                feeRate,
                FEE_RATE_DENOMINATOR.sub(feeRate),
                64
            );
            nextSqrtPrice = targetSqrtPrice;
        }
        amountOut = getDeltaDownFromOutput(
            currentSqrtPrice,
            nextSqrtPrice,
            liquidity,
            a2b
        );
    } else {
        const maxAmountOut = getDeltaDownFromOutput(
            currentSqrtPrice,
            targetSqrtPrice,
            liquidity,
            a2b
        );
        if (maxAmountOut.gt(amount)) {
            amountOut = amount;
            nextSqrtPrice = getNextSqrtPriceFromOutput(
                currentSqrtPrice,
                liquidity,
                amount,
                a2b
            );
        } else {
            amountOut = maxAmountOut;
            nextSqrtPrice = targetSqrtPrice;
        }
        amountIn = getDeltaUpFromInput(currentSqrtPrice, nextSqrtPrice, liquidity, a2b);
        feeAmount = MathUtil.checkMulDivCeil(
            amountIn,
            feeRate,
            FEE_RATE_DENOMINATOR.sub(feeRate),
            64
        );
    }
    return {
        amountIn,
        amountOut,
        nextSqrtPrice,
        feeAmount
    };
}

/**
 * Estimates the liquidity for coin A.
 *
 * @param sqrtPriceX - The sqrt price of coin A
 * @param sqrtPriceY - The sqrt price of coin B
 * @param coinAmount - The amount of tokens involved
 * @returns
 */

export function estimateLiquidityForCoinA(
    sqrtPriceX: BN,
    sqrtPriceY: BN,
    coinAmount: BN
) {
    const lowerSqrtPriceX64 = BN.min(sqrtPriceX, sqrtPriceY);
    const upperSqrtPriceX64 = BN.max(sqrtPriceX, sqrtPriceY);
    const num = MathUtil.fromX64_BN(
        coinAmount.mul(upperSqrtPriceX64).mul(lowerSqrtPriceX64)
    );
    const dem = upperSqrtPriceX64.sub(lowerSqrtPriceX64);
    return num.div(dem);
}

/**
 * Estimates the liquidity for coin B.
 *
 * @param sqrtPriceX - The sqrt price of coin A
 * @param sqrtPriceY - The sqrt price of coin B
 * @param coinAmount - The amount of tokens involved
 * @returns
 */

export function estimateLiquidityForCoinB(
    sqrtPriceX: BN,
    sqrtPriceY: BN,
    coinAmount: BN
) {
    const lowerSqrtPriceX64 = BN.min(sqrtPriceX, sqrtPriceY);
    const upperSqrtPriceX64 = BN.max(sqrtPriceX, sqrtPriceY);
    const delta = upperSqrtPriceX64.sub(lowerSqrtPriceX64);
    return coinAmount.shln(64).div(delta);
}

export class ClmmPoolUtil {
    /**
     * Calculates the token amount from liquidity.
     *
     * @param liquidity - The available liquidity
     * @param curSqrtPrice - The current sqrt price of the pool
     * @param lowerSqrtPrice - The lower sqrt price of the position
     * @param upperSqrtPrice - The upper sqrt price of the position
     * @param roundUp - Specifies whether to round the result up
     * @returns
     */
    static getCoinAmountFromLiquidity(
        liquidity: BN,
        curSqrtPrice: BN,
        lowerSqrtPrice: BN,
        upperSqrtPrice: BN,
        roundUp: boolean
    ): CoinAmounts {
        const liq = new Decimal(liquidity.toString());
        const curSqrtPriceStr = new Decimal(curSqrtPrice.toString());
        const lowerPriceStr = new Decimal(lowerSqrtPrice.toString());
        const upperPriceStr = new Decimal(upperSqrtPrice.toString());
        let coinA;
        let coinB;
        if (curSqrtPrice.lt(lowerSqrtPrice)) {
            coinA = MathUtil.toX64_Decimal(liq)
                .mul(upperPriceStr.sub(lowerPriceStr))
                .div(lowerPriceStr.mul(upperPriceStr));
            coinB = new Decimal(0);
        } else if (curSqrtPrice.lt(upperSqrtPrice)) {
            coinA = MathUtil.toX64_Decimal(liq)
                .mul(upperPriceStr.sub(curSqrtPriceStr))
                .div(curSqrtPriceStr.mul(upperPriceStr));

            coinB = MathUtil.fromX64_Decimal(liq.mul(curSqrtPriceStr.sub(lowerPriceStr)));
        } else {
            coinA = new Decimal(0);
            coinB = MathUtil.fromX64_Decimal(liq.mul(upperPriceStr.sub(lowerPriceStr)));
        }
        if (roundUp) {
            return {
                coinA: new BN(coinA.ceil().toString()),
                coinB: new BN(coinB.ceil().toString())
            };
        }
        return {
            coinA: new BN(coinA.floor().toString()),
            coinB: new BN(coinB.floor().toString())
        };
    }

    /**
     * Estimates liquidity based on token amounts.
     *
     * @param curSqrtPrice - The current sqrt price
     * @param lowerTick - The lower tick
     * @param upperTick - The upper tick
     * @param tokenAmount - The amount of tokens
     * @returns
     */

    static estimateLiquidityFromCoinAmounts(
        curSqrtPrice: BN,
        lowerTick: number,
        upperTick: number,
        tokenAmount: CoinAmounts
    ): BN {
        if (lowerTick > upperTick) {
            throw new ClmmpoolsError(
                "Lower tick value cannot be greater than the upper tick value",
                MathErrorCode.InvalidTwoTickIndex
            );
        }
        const currTick = TickMath.sqrtPriceX64ToTickIndex(curSqrtPrice);
        const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick);
        const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick);
        if (currTick < lowerTick) {
            return estimateLiquidityForCoinA(
                lowerSqrtPrice,
                upperSqrtPrice,
                tokenAmount.coinA
            );
        }
        if (currTick >= upperTick) {
            return estimateLiquidityForCoinB(
                upperSqrtPrice,
                lowerSqrtPrice,
                tokenAmount.coinB
            );
        }
        const estimateLiquidityAmountA = estimateLiquidityForCoinA(
            curSqrtPrice,
            upperSqrtPrice,
            tokenAmount.coinA
        );
        const estimateLiquidityAmountB = estimateLiquidityForCoinB(
            curSqrtPrice,
            lowerSqrtPrice,
            tokenAmount.coinB
        );
        return BN.min(estimateLiquidityAmountA, estimateLiquidityAmountB);
    }

    /**
     * Estimate liquidity and token amount from one amounts
     * @param lowerTick - lower tick
     * @param upperTick - upper tick
     * @param coinAmount - token amount
     * @param isCoinA - is token A
     * @param roundUp - is round up
     * @param slippage - slippage percentage
     * @param curSqrtPrice - current sqrt price.
     * @return IncreaseLiquidityInput
     */
    static estLiquidityAndCoinAmountFromOneAmounts(
        lowerTick: number,
        upperTick: number,
        coinAmount: BN,
        isCoinA: boolean,
        roundUp: boolean,
        slippage: number,
        curSqrtPrice: BN
    ): LiquidityInput {
        const currentTick = TickMath.sqrtPriceX64ToTickIndex(curSqrtPrice);
        const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick);
        const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick);
        let liquidity;
        if (currentTick < lowerTick) {
            if (!isCoinA) {
                throw new ClmmpoolsError(
                    "lower tick cannot calculate liquidity by coinB",
                    MathErrorCode.NotSupportedThisCoin
                );
            }
            liquidity = estimateLiquidityForCoinA(
                lowerSqrtPrice,
                upperSqrtPrice,
                coinAmount
            );
        } else if (currentTick > upperTick) {
            if (isCoinA) {
                throw new ClmmpoolsError(
                    "upper tick cannot calculate liquidity by coinA",
                    MathErrorCode.NotSupportedThisCoin
                );
            }
            liquidity = estimateLiquidityForCoinB(
                upperSqrtPrice,
                lowerSqrtPrice,
                coinAmount
            );
        } else if (isCoinA) {
            liquidity = estimateLiquidityForCoinA(
                curSqrtPrice,
                upperSqrtPrice,
                coinAmount
            );
        } else {
            liquidity = estimateLiquidityForCoinB(
                curSqrtPrice,
                lowerSqrtPrice,
                coinAmount
            );
        }
        const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
            liquidity,
            curSqrtPrice,
            lowerSqrtPrice,
            upperSqrtPrice,
            roundUp
        );
        const tokenLimitA = roundUp
            ? d(coinAmounts.coinA.toString())
                  .mul(1 + slippage)
                  .toString()
            : d(coinAmounts.coinA.toString())
                  .mul(1 - slippage)
                  .toString();

        const tokenLimitB = roundUp
            ? d(coinAmounts.coinB.toString())
                  .mul(1 + slippage)
                  .toString()
            : d(coinAmounts.coinB.toString())
                  .mul(1 - slippage)
                  .toString();

        return {
            coinAmount,
            coinAmountA: coinAmounts.coinA,
            coinAmountB: coinAmounts.coinB,
            tokenMaxA: roundUp
                ? new BN(Decimal.ceil(tokenLimitA).toString())
                : new BN(Decimal.floor(tokenLimitA).toString()),
            tokenMaxB: roundUp
                ? new BN(Decimal.ceil(tokenLimitB).toString())
                : new BN(Decimal.floor(tokenLimitB).toString()),
            liquidityAmount: liquidity,
            fix_amount_a: isCoinA
        };
    }
}
