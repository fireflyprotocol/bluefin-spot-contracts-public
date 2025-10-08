import { Address, NumStr, Side, SupportedAssets } from "../types";
import { ISignedNumber } from "./IOnChainCalls";
import { DepositedAsset, IPosition } from "./IUser";

export interface IBankBalanceUpdateEvent {
    account: Address;
    action_type: number;
    amount: NumStr;
    asset: SupportedAssets;
    assets: Array<DepositedAsset>;
    sequence_hash: Uint8Array;
    sequence_number: string;
}

export interface IAssetBankDepositEvent {
    id: Address;
    asset: SupportedAssets;
    from: Address;
    to: Address;
    amount: NumStr;
    nonce: NumStr;
    sequence_number: string;
}

export interface IAssetBankCreatedEvent {
    id: Address;
    asset: SupportedAssets;
    decimals: number;
    weight: number;
    price: number;
    collateral: boolean;
    sequence_number: string;
}

export interface IAccountAuthorizedEvent {
    account: Address;
    users: Array<Address>;
    authorized: boolean;
    sequence_number: string;
}

export interface ITradeExecutedEvent {
    market: Address;
    maker_hash: Uint8Array;
    taker_hash: Uint8Array;
    maker_position: IPosition;
    taker_position: IPosition;
    maker_assets: Array<DepositedAsset>;
    taker_assets: Array<DepositedAsset>;
    fill_quantity: NumStr;
    fill_price: NumStr;
    taker_side: Side;
    sequence_hash: Uint8Array;
    sequence_number: string;
}

export interface ILiquidationExecutedEvent {
    market: Address;
    hash: Uint8Array;
    liquidatee_position: IPosition;
    liquidator_position: IPosition;
    liquidatee_assets: Array<DepositedAsset>;
    liquidator_assets: Array<DepositedAsset>;
    quantity: NumStr;
    liq_purchase_price: NumStr;
    bankruptcy_price: NumStr;
    oracle_price: NumStr;
    liquidator_side: Side;
    sequence_hash: Uint8Array;
    sequence_number: string;
}

export interface IMarginAdjustedEvent {
    account: Address;
    amount: NumStr;
    added: boolean;
    position: IPosition;
    assets: Array<DepositedAsset>;
    sequence_hash: Uint8Array;
    sequence_number: string;
}

export interface ILeverageAdjustedEvent {
    account: Address;
    position: IPosition;
    assets: Array<DepositedAsset>;
    sequence_hash: Uint8Array;
    sequence_number: string;
}

export interface IOperatorUpdatedEvent {
    id: Address;
    operator_type: string;
    previous_operator: Address;
    new_operator: Address;
    sequence_number: string;
}

export interface IFundingRateUpdatedEvent {
    market: Address;
    rate: ISignedNumber;
    timestamp: NumStr;
    sequence_number: string;
}
