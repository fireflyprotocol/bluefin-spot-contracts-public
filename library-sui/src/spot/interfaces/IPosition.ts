import { Address, ID } from "../../v3/types";

export interface IPosition {
    owner: Address;
    pool_id: ID;
    position_id: ID;
    lower_tick: number;
    upper_tick: number;
    liquidity: number;
    fee_growth_coin_a: number;
    fee_growth_coin_b: number;
    fee_rate: number;
    token_a_fee: number;
    token_b_fee: number;
}
