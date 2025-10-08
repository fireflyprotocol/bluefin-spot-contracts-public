/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

import BN from "bn.js";

/**
 * Represents the maximum tick index supported by the clmmpool program.
 * @category Constants
 */

export const MAX_TICK_INDEX = 443636;

/**
 * Represents the minimum tick index supported by the clmmpool program.
 * @category Constants
 */

export const MIN_TICK_INDEX = -443636;

/**
 * Represents the maximum sqrt price supported by the clmmpool.
 * @category Constants
 */

export const MAX_SQRT_PRICE = "79226673515401279992447579055";

/**
 * Defines the number of initialized ticks that a tick-array account can store.
 * @category Constants
 */
export const TICK_ARRAY_SIZE = 64;

/**
 * Represents the minimum sqrt price supported by the clmmpool program.
 * @category Constants
 */

export const MIN_SQRT_PRICE = "4295048016";

/**
 * The denominator used to divide the fee rate.
 * @category Constants
 */

export const FEE_RATE_DENOMINATOR = new BN(1_000_000);
