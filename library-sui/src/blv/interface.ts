import { SignaturePayloadStruct } from "./signer";

export interface ObjectsMap {
    [object: string]: string;
}

export interface RewardPool {
    id: string;
    coin: string;
}

export type SignaturePayload = typeof SignaturePayloadStruct.$inferType;

export interface Vault {
    id: string;
    account: string;
}

export interface BLVDeploymentConfig {
    Package: string;
    UpgradeCap: string;
    AdminCap: string;
    SupportedCoin: string;
    BluefinBank: string;
    BluefinSequencer: string;
    BluefinSubAccounts: string;
    BluefinVaultStore: string;
    BluefinPackage: string;
    BluefinPackageBase: string;
    Vaults: { [mm: string]: Vault };
    RewardsPool: { [coin: string]: RewardPool };
}

export interface User {
    amountLocked: string;
    pendingWithdrawal: string;
    shares: string;
}
