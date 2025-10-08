import { ID } from "../v3/types";
import { ICoin } from "./interfaces";

export type Tick = { bits: number };

export type RewardsInfo = {
    ended_at_seconds: number;
    last_update_time: number;
    reward_coin_decimals: number;
    reward_coin_symbol: string;
    reward_coin_type: string;
    reward_growth_global: string;
    reward_per_seconds: string;
    total_reward: number;
    total_reward_allocated: number;
};

export type Pool = {
    id: ID;
    name: string;
    coin_a: ICoin;
    coin_b: ICoin;
    current_sqrt_price: string;
    current_tick: number;
    liquidity: string;
    is_paused: boolean;
    fee_rate: number;
    ticks_manager: {
        bitmap: any;
        tick_spacing: number;
        ticks: any;
    };
    observations_manager: {
        observation_cardinality: number;
        observation_cardinality_next: number;
        observation_index: number;
        observations: Array<any>;
    };
    rewardsInfo: Array<RewardsInfo>;
    protocol_fee_coin_a: number;
    protocol_fee_coin_b: number;
};
