import { BigNumber, BN } from "../../types";
import { CoinAmounts } from "../clmm";
import { Pool } from "../types";

export interface ILiquidityParams {
    lowerPrice: number;
    upperPrice: number;

    lowerPriceX64: BN;
    upperPriceX64: BN;

    // these are tick bits
    lowerTick: number;
    upperTick: number;

    liquidity: number;

    coinAmounts: CoinAmounts;
    minCoinAmounts: CoinAmounts;
}

export interface Tick {
    bits: number;
}

export interface IAddRewardParams {
    pool: Pool;
    rewardCoinSymbol: string;
    rewardCoinDecimals: number;
    startTime: number;
    activeForSeconds: number;
    rewardCoinType: string;
    rewardAmount: BigNumber;
}

export interface IRewardCoinsInPool {
    coinType: string;
    coinSymbol: string;
    coinDecimals: number;
}

export interface IPoolRewardInfo {
    ended_at_seconds: string;
    last_update_time: string;
    reward_coin_decimals: number;
    reward_coin_symbol: string;
    reward_coin_type: string;
    reward_growth_global: string;
    reward_per_seconds: string;
    total_reward: string;
    total_reward_allocated: string;
}

export interface IRewardAmounts {
    coinType: string;
    coinAmount: string;
    coinSymbol: string;
    coinDecimals: number;
}

export interface IFeeAndRewards {
    rewards: IRewardAmounts[];
    fee: CoinAmounts;
}
