import { ZkPayload } from "../../interfaces";
import { BigNumberable, Signer, SuiAddress, TransactionBlock } from "../../types";
import { Address } from "../../v3/types";
import { Pool } from "../types";

export interface IOnChainCallOptionalParams {
    txb?: TransactionBlock;
    gasBudget?: number;
    sender?: string;
    sign?: boolean;
    dryRun?: boolean;
    returnTx?: boolean;
}

export interface ISwapParams {
    // the pool itself or the name of the pool
    pool: Pool;
    amountIn: BigNumberable;
    amountOut: BigNumberable;
    aToB: boolean;
    byAmountIn: boolean;
    // number between 0 to 1
    slippage: number;
    recipient?: SuiAddress;
    estimateAmount?: boolean;
    applySlippageToPrice?: boolean;
}

export interface ISwapRoute {
    fromCoin: string;
    toCoin: string;
    inputAmount: number | string;
    outputAmount: number | string;
    // number between 0 to 1
    slippage: number;
    byAmountIn: boolean;
    path: Array<IEdge>;
    recepient?: SuiAddress;
}

export interface IEdge {
    pool: Pool;
    a2b: boolean;
    byAmountIn: boolean;
    amountIn: number;
    amountOut: number;
}

export interface ISignerConfig {
    signer: Signer;
    address: Address;
    isUIWallet: boolean;
    isZkLogin?: boolean;
    zkPayload?: ZkPayload;
}
