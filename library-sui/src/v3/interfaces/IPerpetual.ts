import { NumStr } from "../types";
import { ISignedNumber } from "./IOnChainCalls";

export interface IPerpetualConfig {
    // the address/id of the perpetual
    id?: string;
    // perpetual name
    symbol?: string;
    // the base asset symbol
    baseAssetSymbol?: string;
    // the base asset name
    baseAssetName?: string;
    // the decimals asset supports
    baseAssetDecimals?: NumStr;
    // default user leverage for the market
    defaultLeverage?: NumStr;
    // min price at which asset can be traded
    minTradePrice?: NumStr;
    // max price at which asset can be traded
    maxTradePrice?: NumStr;
    // the smallest decimal unit supported by asset for price
    tickSize?: NumStr;
    // minimum quantity of asset that can be traded
    minTradeQty?: NumStr;
    // maximum quantity of asset that can be traded
    maxTradeQty?: NumStr;
    // the smallest decimal unit supported by asset for quantity
    stepSize?: NumStr;
    //  market take bound for long side ( 10% == 100000000000000000)
    mtbLong?: NumStr;
    //  market take bound for short side ( 10% == 100000000000000000)
    mtbShort?: NumStr;
    // array of maxAllowed values for leverage (0 index will contain dummy value, later indexes will represent leverage)
    maxNotionalAtOpen?: NumStr[];
    // imr: the initial margin collat percentage
    imr?: NumStr;
    // mmr: the minimum collat percentage
    mmr?: NumStr;
    // default maker order fee for this Perpetual
    makerFee?: NumStr;
    // default taker order fee for this Perpetual
    takerFee?: NumStr;
    // max allowed funding rate
    maxFundingRate?: NumStr;
    // portion of liquidation premium to be transferred to insurance pool
    insurancePoolRatio?: NumStr;
    // address of insurance pool
    insurancePool?: string;
    // address of fee pool
    feePool?: string;
    // time at which trading will start on perpetual
    tradingStartTime?: NumStr;
    // the id for the price info feed (Pyth)
    priceInfoFeedId?: string;
    // is the perpetual de-listed
    delist?: boolean;
    // is trading permitted on the perp
    tradingStatus?: boolean;
    // if the perpetual only for isolated trading?
    isolatedOnly?: boolean;
    // the delisting price
    delistingPrice?: NumStr;
    /** Order Limits */
    maxLimitOrderQuantity?: NumStr;
    maxMarketOrderQuantity?: NumStr;
}

export interface IFundingRate {
    timestamp: NumStr;
    rate: ISignedNumber;
}
