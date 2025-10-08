import { SuiAddress } from "../../types";
import { Address, ID } from "../../v3/types";
import { Tick } from "../types";

export interface IPoolCreatedEvent {
    id: ID;
    coin_a: string;
    coin_a_symbol: string;
    coin_a_decimals: number;
    coin_a_url: string;
    coin_b: string;
    coin_b_symbol: string;
    coin_b_decimals: number;
    coin_b_url: string;
    current_sqrt_price: string;
    current_tick_index: Tick;
    tick_spacing: number;
    fee_rate: string;
    protocol_fee_share: string;
}

export interface ISwapEvent {
    pool_id: ID;
    a2b: boolean;
    amount_in: string;
    amount_out: string;
    fee: string;
    current_tick: Tick;
    before_sqrt_price: string;
    after_sqrt_price: string;
    exceeded: boolean;
    recipient: SuiAddress;
    sender: SuiAddress;
    sequence_number: string;
}

export interface ISwapResultEvent {
    a2b: boolean;
    by_amount_in: boolean;
    current_tick_index: Tick;
    amount_specified: string;
    amount_specified_remaining: string;
    amount_calculated: string;
    fee_growth_global: string;
    fee_amount: string;
    protocol_fee: string;
    start_sqrt_price: string;
    end_sqrt_price: string;
    is_exceed: boolean;
    liquidity: string;
    steps: number;
    step_results: Array<any>;
}

export interface IPositionOpenEvent {
    sender: Address;
    pool_id: ID;
    position_id: ID;
    tick_lower: Tick;
    tick_upper: Tick;
}

export interface IPositionClosedEvent {
    sender: Address;
    pool_id: ID;
    position_id: ID;
    tick_lower: Tick;
    tick_upper: Tick;
}

export interface ILiquidityProvidedEvent {
    pool_id: ID;
    position_id: ID;
    sender: Address;
    coin_a_amount: string;
    coin_b_amount: string;
    liquidity: string;
    pool_current_liquidity: string;
    current_sqrt_price: string;
    current_tick_index: string;
    lower_tick: Tick;
    upper_tick: Tick;
    sequence_number: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ILiquidityRemoved extends ILiquidityProvidedEvent {}

export interface IUserFeeClaimedEvent {
    pool_id: ID;
    position_id: ID;
    sender: Address;
    destination: Address;
    coin_a_amount: string;
    coin_b_amount: string;
    sequence_number: string;
}

export interface IUserRewardClaimedEvent {
    pool_id: ID;
    position_id: ID;
    reward_amount: string;
    reward_symbol: string;
    reward_decimals: number;
    reward_type: string;
    sequence_number: string;
}

export interface IUpdatePoolRewardEmissionEvent {
    ended_at_seconds: string;
    last_update_time: string;
    pool_id: ID;
    reward_coin_decimals: number;
    reward_coin_symbol: string;
    reward_coin_type: string;
    reward_per_seconds: string;
    total_reward: string;
}
