import { BigNumberable, TransactionBlock } from "../../types";
import { NumStr } from "../types";
import { ISignedOrder } from "./IOrder";

export interface ITxBuilderOptionalParams {
    txBlock?: TransactionBlock;
    gasBudget?: number;
    sender?: string;
}

export interface IBluefinV3OptionalParams extends ITxBuilderOptionalParams {
    dryRun?: boolean;
    returnTxb?: boolean;
}

export interface IOraclePriceUpdate {
    perpetual: string;
    price: BigNumberable;
}

export interface IBatchTradeArgs {
    makerOrder: ISignedOrder;
    takerOrder: ISignedOrder;
    quantity: BigNumberable;
    oraclePrices: Array<IOraclePriceUpdate>;
    sequenceHash: string;
    timestamp: NumStr;
}

export interface ISignedNumber {
    value: NumStr;
    sign: boolean;
}
