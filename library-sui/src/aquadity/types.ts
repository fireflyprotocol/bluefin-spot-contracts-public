import { Pool } from "../spot/types";
import { BigNumberable } from "../types";
import { Address, ID } from "../v3/types";

export type AuqadityContracts = {
    BasePackage: Address;
    CurrentPackage: Address;
    UpgradeCap: Address;
    AdminCap: Address;
    ProtocolConfig: Address;
    VaultStore: Address;
    Operators: { [key: string]: Address };
    Vaults?: Array<Vault>;
};

export type Vault = {
    id: ID;
    manager: Address;
    name: string;
    index: string;
    type: number;
    users?: Array<Address>;
    sequence_number?: string;
};

export type Reserves = {
    id: ID;
    coinType: string;
    value: number;
};

export type CreateVaultArgs = {
    // The name of the vault
    name: string;
    // should be between 0 and 2^8 -1
    type?: number;
    // The manager of the vault, defaults to self
    manager?: Address;
    // The whitelisted users of the vault, defaults to none
    users?: Array<Address>;
};

export type FundVaultArgs = {
    // The id of the vault
    vault: ID;
    // The type of the coin to be funded. e.g: `address:module::struct` such as `0x2::sui::SUI`
    coinType: string;
    // The amount to be funded with
    amount: BigNumberable;
};

export type WithdrawFundArgs = {
    // The id of the vault
    vault: ID;
    // The type of the coin to be withdrawn. e.g: `address:module::struct` such as `0x2::sui::SUI`
    coinType: string;
    // The amount to be withdrawn
    amount: BigNumberable;
};

export type UpdateUsersArgs = {
    // The id of the vault
    vault: ID;
    // True if the users are to be added, false other wise
    add: boolean;
    // addresses of the users
    users: Array<Address>;
};

export type OpenPositionArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to open position on
    pool: Pool;
    // unsigned lower tick bits (-443636 to 443636)
    lowerTickBits: number;
    // unsigned upper tick bits (-443636 to 443636)
    upperTickBits: number;
};

export type ProvideLiquidityArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to provide liquidity to
    pool: Pool;
    // The id of the position to provide liquidity into
    position: ID;
    // The amount of fixed token A or B
    amount: BigNumberable;
    // The max amount of token A to provide
    coinAMax: BigNumberable;
    // The max amount of token B to provide
    coinBMax: BigNumberable;
    // True if fixed token is A, false otherwise
    isFixedA: boolean;
};

export type RemoveLiquidityArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to remove liquidity from
    pool: Pool;
    // The id of the position to remove liquidity from
    position: ID;
    // The amount of fixed token A or B
    liquidity: BigNumberable;
    // The min amount of token A expected to be received
    coinAMin: BigNumberable;
    // The min amount of token B expected to be received
    coinBMin: BigNumberable;
};

export type CollectFeeArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to collect fee from
    pool: Pool;
    // The id of the position to collect fee from
    position: ID;
    // The address to which collected fee will be sent
    destination: Address;
};

export type CollectRewardArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to collect fee from
    pool: Pool;
    // The id of the position to collect fee from
    position: ID;
    // The reward type to be collected
    rewardCoinType: string;
    // The address to which collected fee will be sent
    destination: Address;
};

export type ClosePositionArgs = {
    // The id of the vault
    vault: ID;
    // The bluefin spot pool to collect fee from
    pool: Pool;
    // The id of the position to collect fee from
    position: ID;
    // The address to which any pending fee will be sent
    destination: Address;
};
