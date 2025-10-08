import { BcsType, bcs } from "@mysten/sui/bcs";
import { hexToUint8Array } from "../../blv";
import { Serialized } from "../types";

/// Deposit request type
export const InternalDeposit = bcs.struct("InternalDeposit", {
    asset: bcs.string(),
    id: bcs.Address,
    from: bcs.Address,
    to: bcs.Address,
    amount: bcs.u64(),
    nonce: bcs.u64()
});

export const AssetBankCreated = bcs.struct("AssetBankCreated", {
    id: bcs.Address,
    asset: bcs.string(),
    decimals: bcs.u8(),
    weight: bcs.u64(),
    price: bcs.u64(),
    collateral: bcs.bool()
});

/// Signed Number
export const SignedNumber = bcs.struct("SignedNumber", {
    value: bcs.u64(),
    sign: bcs.bool()
});

/// Signed Number
export const FundingRate = bcs.struct("FundingRate", {
    timestamp: bcs.u64(),
    rate: SignedNumber
});

export const PerpetualUpdate = bcs.struct("PerpetualUpdate", {
    id: bcs.Address,
    symbol: bcs.string(),
    imr: bcs.u64(),
    mmr: bcs.u64(),
    stepSize: bcs.u64(),
    tickSize: bcs.u64(),
    minTradeQty: bcs.u64(),
    maxTradeQty: bcs.u64(),
    minTradePrice: bcs.u64(),
    maxTradePrice: bcs.u64(),
    maxNotionalAtOpen: bcs.vector(bcs.u64()),
    mtbLong: bcs.u64(),
    mtbShort: bcs.u64(),
    makerFee: bcs.u64(),
    takerFee: bcs.u64(),
    maxFundingRate: bcs.u64(),
    insurancePoolRatio: bcs.u64(),
    insurancePool: bcs.Address,
    feePool: bcs.Address,
    tradingStatus: bcs.bool(),
    tradingStartTime: bcs.u64(),
    delist: bcs.bool(),
    delistingPrice: bcs.u64(),
    isolatedOnly: bcs.bool(),

    // off-chain config
    baseAssetSymbol: bcs.string(),
    baseAssetName: bcs.string(),
    baseAssetDecimals: bcs.u64(),
    maxLimitOrderQuantity: bcs.u64(),
    maxMarketOrderQuantity: bcs.u64(),
    defaultLeverage: bcs.u64(),

    // @dev this will be zero when doing bcs serialization
    oraclePrice: bcs.u64(),
    // @dev This will be set as { timestamp: 0, value:0, sign: 0}
    funding: FundingRate
});

/// Signature type
export const Signature = bcs.struct("Signature", {
    sig: bcs.vector(bcs.u8()),
    pk: bcs.vector(bcs.u8()),
    type: bcs.u8()
});

/// Withdraw request type
export const Withdrawal = bcs.struct("Withdrawal", {
    assetSymbol: bcs.string(),
    assetBankID: bcs.Address,
    account: bcs.Address,
    amount: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

/// Authorize request type
export const AuthorizeUser = bcs.struct("AuthorizeUser", {
    account: bcs.Address,
    user: bcs.Address,
    status: bcs.bool(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

/// Order type
export const Order = bcs.struct("Order", {
    marketAddress: bcs.Address,
    accountAddress: bcs.Address,
    price: bcs.u64(),
    quantity: bcs.u64(),
    leverage: bcs.u64(),
    side: bcs.string(),
    isIsolated: bcs.bool(),
    expiration: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const TradeData = bcs.struct("TradeData", {
    makerSignature: bcs.vector(bcs.u8()),
    takerSignature: bcs.vector(bcs.u8()),
    quantity: bcs.u64(),
    timestamp: bcs.u64()
});

export const Liquidate = bcs.struct("Liquidate", {
    liquidator: bcs.Address,
    liquidatee: bcs.Address,
    marketAddress: bcs.Address,
    quantity: bcs.u64(),
    isolated: bcs.bool(),
    allOrNothing: bcs.bool(),
    assumeAsCross: bcs.bool(),
    leverage: bcs.u64(),
    expiry: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const Deleverage = bcs.struct("Deleverage", {
    maker: bcs.Address,
    taker: bcs.Address,
    marketAddress: bcs.Address,
    isolated: bcs.bool(),
    allOrNothing: bcs.bool(),
    quantity: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const AdjustMargin = bcs.struct("AdjustMargin", {
    account: bcs.Address,
    marketAddress: bcs.Address,
    add: bcs.bool(),
    amount: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const AdjustLeverage = bcs.struct("AdjustLeverage", {
    account: bcs.Address,
    marketAddress: bcs.Address,
    leverage: bcs.u64(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const SyncOperator = bcs.struct("SyncOperator", {
    operatorType: bcs.string(),
    previousOperator: bcs.Address,
    newOperator: bcs.Address
});

export const SetFundingRate = bcs.struct("SetFundingRate", {
    timestamp: bcs.u64(),
    marketFundingRates: bcs.vector(bcs.vector(bcs.u8())),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const MarketFundingRate = bcs.struct("MarketFundingRate", {
    marketAddress: bcs.Address,
    value: bcs.u64(),
    sign: bcs.bool()
});

export const ApplyFundingRate = bcs.struct("ApplyFundingRate", {
    // the address of the Internal Data Store is to make the funding rate payload unique
    // for local/dev/test and mainnet.
    ids: bcs.Address,
    timestamp: bcs.u64(),
    accounts: bcs.vector(bcs.Address),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export const PruneTable = bcs.struct("PruneTable", {
    hashes: bcs.vector(bcs.vector(bcs.u8())),
    type: bcs.u8(),
    salt: bcs.u64(),
    signedAt: bcs.u64()
});

export class BCSUtils {
    /// Returns serialized data hex string
    public static getSerializedDataBytes<T>(data: T, dataType: BcsType<T>) {
        return dataType.serialize(data).toBytes();
    }

    /// Returns serialized data hex string
    public static getSerializedDataHex<T>(data: T, dataType: BcsType<T>) {
        return dataType.serialize(data).toHex();
    }

    /// Deserializes a serialized data string (hex)
    public static deserializeData<T>(data: Serialized, dataType: BcsType<T>) {
        return dataType.parse(hexToUint8Array(data));
    }
}
