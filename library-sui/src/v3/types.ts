import {
    IAuthorizeUser,
    IAssetBankCreated,
    IAssetBankDeposit,
    IOrder,
    IPerpetualUpdate,
    ISignature,
    ITradeData,
    IWithdrawal,
    ILiquidate,
    IAdjustMargin,
    IAdjustLeverage,
    ISyncOperator,
    ISetFundingRate,
    IMarketFundingRate,
    IApplyFundingRate
} from "./interfaces";

export type SerializableStruct =
    | IAssetBankDeposit
    | IPerpetualUpdate
    | ISignature
    | IWithdrawal
    | IAuthorizeUser
    | IOrder
    | IAssetBankCreated
    | ITradeData
    | ILiquidate
    | IAdjustMargin
    | IAdjustLeverage
    | ISyncOperator
    | ISetFundingRate
    | IMarketFundingRate
    | IApplyFundingRate;

export type Serializable =
    | "InternalDeposit"
    | "PerpetualUpdate"
    | "Signature"
    | "Withdrawal"
    | "AuthorizeUser"
    | "Order"
    | "AssetBankCreated"
    | "TradeData"
    | "Liquidate"
    | "AdjustMargin"
    | "AdjustLeverage"
    | "SyncOperator"
    | "SetFundingRate"
    | "MarketFundingRate"
    | "ApplyFundingRate";

export type Serialized = string;

export type NumStr = number | string;

export type SupportedAssets = "USDC";

export type Side = "LONG" | "SHORT";

export type Address = string;

export type Operator = "guardian" | "funding" | "fee" | "pruning";

export type ID = string;
