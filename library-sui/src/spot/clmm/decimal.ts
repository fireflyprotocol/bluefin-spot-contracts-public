/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

import Decimal from "decimal.js";

Decimal.config({
    precision: 64,
    rounding: Decimal.ROUND_DOWN,
    toExpNeg: -64,
    toExpPos: 64
});

export default Decimal;
