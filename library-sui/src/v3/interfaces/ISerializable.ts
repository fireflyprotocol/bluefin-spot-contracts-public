import { PRUNE_TABLES } from "../enums";
import { Address, NumStr, Operator, Side, SupportedAssets } from "../types";
import { IAssetBankCreatedEvent, IAssetBankDepositEvent } from "./IChainEvents";
import { IFundingRate } from "./IPerpetual";

export type IAssetBankDeposit = IAssetBankDepositEvent;

export type IAssetBankCreated = IAssetBankCreatedEvent;

export interface IPerpetualUpdate {
    id: Address;
    symbol: string;
    imr: NumStr;
    mmr: NumStr;
    stepSize: NumStr;
    tickSize: NumStr;
    minTradeQty: NumStr;
    maxTradeQty: NumStr;
    minTradePrice: NumStr;
    maxTradePrice: NumStr;
    maxNotionalAtOpen: NumStr[];
    mtbLong: NumStr;
    mtbShort: NumStr;
    makerFee: NumStr;
    takerFee: NumStr;
    maxFundingRate: NumStr;
    insurancePool_ratio: NumStr;
    insurancePool: string;
    feePool: string;
    tradingStart_time: NumStr;
    delist: boolean;
    tradingStatus: boolean;
    delistingPrice: NumStr;
    // @dev This will be passed as ZERO for bcs serialization
    oraclePrice: NumStr;
    // @dev This will be set as { timestamp: 0, value:0, sign: 0}
    funding: IFundingRate;
}

export interface ISignature {
    sig: Uint8Array;
    pk: Uint8Array;
    scheme: number;
}

export interface IWithdrawal {
    assetSymbol: SupportedAssets;
    assetBankID: Address;
    account: string;
    amount: NumStr;
    salt: NumStr;
    // timestamp at which the payload was created
    signedAt: NumStr;
}

export interface IAuthorizeUser {
    account: Address;
    user: Address;
    status: boolean;
    salt: NumStr;
    // timestamp at which the payload was created
    signedAt: NumStr;
}

export interface IOrder {
    // Address of the perpetual for which the order is being created
    marketAddress: Address;
    /// address of the account `Alice`, `Bob` etc.. for which the order is being created
    accountAddress: Address;
    // price in 1e9 base
    price: NumStr;
    // quantity in 1e9 base
    quantity: NumStr;
    // leverage for the order. Ignored when `isIsolated` flag is false
    leverage: NumStr;
    // order side `LONG` or `SHORT`
    side: Side;
    // indicates if the order is for cross of isolated position
    isIsolated: boolean;
    // expiry of the order in milliseconds
    expiration: NumStr;
    // a random number to make the order unique
    salt: NumStr;
    // timestamp at which order was created (in ms)
    signedAt: NumStr;
}

// The interface of the trade data encoded into BCS to build
// a unique hash that is then used to generate the sequence hash
export interface ITradeData {
    makerSignature: Uint8Array;
    takerSignature: Uint8Array;
    quantity: NumStr;
    timestamp: NumStr;
}

// Interface for the liquidation payload that is signed by the liquidator
// and sent on-chain
export interface ILiquidate {
    // address of the liquidator
    liquidator: Address;
    // address of the account being liquidated
    liquidatee: Address;
    // market/perpetual for which to liquidate user position
    marketAddress: Address;
    // the amount of position to be liquidated
    quantity: NumStr;
    // True if the position being liquidated is isolated
    isolated: boolean;
    // True if the entire `quantity` provided must get liquidated else `False`
    allOrNothing: boolean;
    // True if liquidator wants to assume the liquidated position as cross `False` otherwise
    assumeAsCross: boolean;
    // If the position is being assumed as Isolated, at what leverage does liquidator wants to assume it?
    // For cross, this will be passed as ZERO
    leverage: NumStr;
    // timestamp by which the liquidation must be executed else revert the liquidation
    expiry: NumStr;
    salt: NumStr;
    signedAt: NumStr;
}

// Interface to be signed by the account owner or authorized user for adding or
// removing margin from their isolated positions
export interface IAdjustMargin {
    account: Address;
    // address of the market/perpetual to which margin is to be added or removed from
    marketAddress: Address;
    // true if margin is to be added, false other wise
    add: boolean;
    // the amount of margin to be added
    amount: NumStr;
    salt: NumStr;
    signedAt: NumStr;
}

// Interface to be signed by the account owner or authorized user for adjust leverage
// on any isolated position
export interface IAdjustLeverage {
    account: Address;
    // address of the isolated market/perpetual for which leverage is to be adjusted
    marketAddress: Address;
    // the new leverage to be set
    leverage: NumStr;
    salt: NumStr;
    signedAt: NumStr;
}

export interface ISyncOperator {
    operatorType: Operator;
    previousOperator: Address;
    newOperator: Address;
}

export interface IMarketFundingRate {
    marketAddress: Address;
    value: NumStr;
    sign: boolean;
}

export interface ISetFundingRate {
    timestamp: NumStr;
    marketFundingRates: Array<Uint8Array>;
    salt: NumStr;
    signedAt: NumStr;
}

export interface IApplyFundingRate {
    ids: Address;
    timestamp: NumStr;
    accounts: Array<Address>;
    salt: NumStr;
    signedAt: NumStr;
}

export interface IPruneTable {
    hashes: Array<Uint8Array>;
    type: PRUNE_TABLES;
    salt: NumStr;
    signedAt: NumStr;
}
