import { Address } from "../types";
import { IPerpetualConfig } from "./IPerpetual";

export interface IOperators {
    admin: Address;
    sequencer: Address;
    funding: Address;
    fee: Address;
    pruning: Address;
}

export interface IDeployment {
    UpgradeCap: string;
    AdminCap: string;
    Package: string;
    TreasuryCap: string;
    AssetBank: string;
    InternalDataStore: string;
    ExternalDataStore: string;
    Operators: IOperators;
    SupportedAssets: {
        [key: string]: IAsset;
    };
    Perpetuals: { [key: string]: IPerpetualConfig };
}

export interface IDeploymentConfig {
    rpc: string;
    wss: string;
    usdc?: string;
    currency?: string;
    operators: {
        [key: string]: Address;
    };
    perpetuals?: Array<IPerpetualConfig>;
}

export interface IAsset {
    bank: string;
    decimals: number;
    currency: string;
}
