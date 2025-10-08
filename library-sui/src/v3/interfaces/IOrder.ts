import { Address, NumStr, Side } from "../types";
import { IOrder } from "./ISerializable";

export interface IOrderCreation {
    marketAddress?: Address;
    accountAddress?: Address;
    price?: NumStr;
    quantity?: NumStr;
    leverage?: NumStr;
    side?: Side;
    isIsolated?: boolean;
    expiration?: number;
    salt?: number;
    signedAt?: number;
}

export interface ISignedOrder extends IOrder {
    hash: string;
    signature: string;
}
