/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

import Decimal from "decimal.js";

export function d(value?: Decimal.Value): Decimal.Instance {
    if (Decimal.isDecimal(value)) {
        return value as Decimal;
    }

    return new Decimal(value === undefined ? 0 : value);
}

export function decimalsMultiplier(decimals?: Decimal.Value): Decimal.Instance {
    return d(10).pow(d(decimals).abs());
}
