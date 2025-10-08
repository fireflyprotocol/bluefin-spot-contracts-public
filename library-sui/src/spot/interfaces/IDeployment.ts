import { Address } from "../../v3/types";
import { IPoolMeta } from "./IPool";

export interface IDeploymentConfig {
    rpc: string;
    wss: string;
    coins: {
        [key: string]: ICoinDetails;
    };
}

export interface ICoinDetails {
    package?: Address;
    treasuryCap?: Address;
    metadata?: Address;
    type: string;
    decimals: number;
    url?: string;
    symbol?: string;
}

export interface IBluefinSpotContracts {
    BasePackage: Address;
    CurrentPackage: Address;
    UpgradeCap: Address;
    GlobalConfig: Address;
    AdminCap: Address;
    Operators: { [key: string]: Address };
    Pools: Array<IPoolMeta>;
}
