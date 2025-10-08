import { bigNumber } from "../library";
import { BigNumber, BigNumberable, BN } from "../types";
import { NumStr } from "../v3/types";
import { ClmmPoolUtil, CoinAmounts, d, TickMath } from "./clmm";
import { ILiquidityParams, IPoolMeta } from "./interfaces";
import { Pool } from "./types";

/**
 * Converts a bigint to an unsigned integer of the specified number of bits.
 * @param {bigint} int - The bigint to convert.
 * @param {number} bits - The number of bits to use in the conversion. Defaults to 32 bits.
 * @returns {string} - Returns the converted unsigned integer as a string.
 */
export function asUintN(int: bigint, bits = 32) {
    return BigInt.asUintN(bits, BigInt(int)).toString();
}

/**
 * Converts given value to unsigned number
 * @param tickValue The value to be converted
 * @returns unsigned number
 */
export function toUnsignedTick(tickValue: NumStr): number {
    return Number(asUintN(BigInt(tickValue)).toString());
}

/**
 * Returns the the bits of lower, upper tick and liquidity
 * to be passed as input to provide liquidity/mint contract call
 */
export function getLiquidityParams(
    pool: Pool,
    lowerPrice: number,
    upperPrice: number,
    coinAmounts: CoinAmounts,
    slippage: number // should be in range 0 to 1
): ILiquidityParams {
    const currentSqrtPriceX64 = new BN(pool.current_sqrt_price);

    const lowerPriceX64 = priceToSqrtPriceX64(pool, lowerPrice);

    const upperPriceX64 = priceToSqrtPriceX64(pool, upperPrice);

    const lowerTick = TickMath.sqrtPriceX64ToTickIndex(lowerPriceX64);
    const upperTick = TickMath.sqrtPriceX64ToTickIndex(upperPriceX64);

    const liquidity = ClmmPoolUtil.estimateLiquidityFromCoinAmounts(
        currentSqrtPriceX64,
        lowerTick,
        upperTick,
        coinAmounts
    ).toNumber();

    const minCoinAmounts: CoinAmounts = {
        coinA: new BN(
            getPercentageAmount(coinAmounts.coinA.toString(), slippage, false).toFixed()
        ),
        coinB: new BN(
            getPercentageAmount(coinAmounts.coinB.toString(), slippage, false).toFixed()
        )
    };

    return {
        lowerTick,
        upperTick,
        lowerPriceX64,
        upperPriceX64,
        lowerPrice,
        upperPrice,
        liquidity,
        coinAmounts,
        minCoinAmounts
    };
}

export function priceToTick(pool: Pool, price: NumStr): number {
    const priceSqrtX64 = priceToSqrtPriceX64(pool, price);
    return TickMath.sqrtPriceX64ToTickIndex(new BN(priceSqrtX64));
}

export function priceToSqrtPriceX64(pool: Pool, price: NumStr): BN {
    return TickMath.priceToSqrtPriceX64(
        d(price),
        pool.coin_a.decimals,
        pool.coin_b.decimals
    );
}

export function sqrtPriceX64ToPrice(pool: Pool, sqrtPriceX64: NumStr | BN): BigNumber {
    return new BigNumber(
        TickMath.sqrtPriceX64ToPrice(
            new BN(sqrtPriceX64),
            pool.coin_a.decimals,
            pool.coin_b.decimals
        ).toString()
    );
}

export function getEstimatedAmountIncludingSlippage(
    amount: BigNumber,
    slippage: BigNumber,
    byAmountIn: boolean
): BigNumber {
    return byAmountIn
        ? amount.minus(amount.multipliedBy(slippage.dividedBy(100)))
        : amount.plus(amount.multipliedBy(slippage.dividedBy(100)));
}

export function parsePool(pool: Pool): IPoolMeta {
    return {
        id: pool.id,
        coinA: pool.coin_a.address,
        coinB: pool.coin_b.address,
        coinADecimals: pool.coin_a.decimals,
        coinBDecimals: pool.coin_b.decimals,
        name: pool.name
    } as IPoolMeta;
}

export function getPercentageAmount(
    number: BigNumberable,
    percentage: number,
    upside
): BigNumber {
    return bigNumber(number).times(bigNumber(upside ? 1 + percentage : 1 - percentage));
}

export function getPools(pools: Array<IPoolMeta>, name: string): Array<IPoolMeta> {
    return pools.filter(pool => pool.name == name);
}
