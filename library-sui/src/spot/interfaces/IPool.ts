import { Address } from "../../v3/types";

export interface IPoolMeta {
    id: Address;
    coinA: string;
    coinB: string;
    coinADecimals: number;
    coinBDecimals: number;
    name: string;
    tickSpacing: number;
    fee: number;
}

export interface ICoin {
    address: string;
    balance: string;
    decimals: number;
}
