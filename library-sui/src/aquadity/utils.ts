import { normalizeSuiAddress } from "@mysten/sui/dist/cjs/utils";
import { IPosition } from "../spot";
import { ID } from "../v3/types";
import { Reserves } from "./types";

/**
 * Tries to find the provided position in the vector of positions and return it
 * @param positions Array containing positions
 * @param id The id of the position to be searched
 * @returns Position or undefined
 */
export function filterPositionByID(
    positions: Array<IPosition>,
    id: ID
): IPosition | undefined {
    return positions.filter(p => p.position_id == id)[0];
}

/**
 * Returns the positions matching the pool id provided
 * @param positions Array containing positions
 * @param id The id of the position to be searched
 * @returns Array of positions containing positions of provided pool
 */
export function filterPositionByPool(
    positions: Array<IPosition>,
    pool: ID
): Array<IPosition> {
    return positions.filter(p => p.pool_id == pool);
}

/**
 * Filters provided list of reserves to find the coin reserves asked for
 * @param reserves Array of coin reserves
 * @param coinType The coin type of reserves to look for
 * @returns Reserves of provided coin
 */
export function filterReserves(
    reserves: Array<Reserves>,
    coinType: string
): Reserves | undefined {
    coinType = coinType.startsWith("0x") ? coinType.substring(2) : coinType;
    return reserves.filter(r => r.coinType == coinType)[0];
}
