import { SignedNumber } from "../../types";
import { NumStr, Side, SupportedAssets } from "../types";

export interface DepositedAsset {
    symbol: SupportedAssets;
    quantity: NumStr;
}

export interface IAccount {
    // user address
    address: string;
    // user margin in internal bank
    assets: Array<DepositedAsset>;
    // array of user cross positions
    crossPositions: Array<IPosition>;
    // array of user's isolated positions
    isolatedPositions: Array<IPosition>;
    // list of authorized users ( other than the parent ) that can trade on behalf of the account
    authorized: Array<string>;
    // The name/symbol of the asset to be used for trade fee payment
    fee_asset: SupportedAssets;
}

export interface IPosition {
    // The address of the perpetual to which the position belongs
    perpetual: string;
    // The size of the current open position
    size: NumStr;
    // average entry price for current open position
    average_entry_price: NumStr;
    // LONG or SHORT
    side: Side;
    // the deposited margin in position. Will be undefined/0 for cross
    margin: NumStr;
    // the position is isolated or not
    is_isolated: boolean;
    // the last funding rate applied to user
    funding: {
        timestamp: number;
        rate: SignedNumber;
    };
    // pending funding amount
    pending_funding_payment: NumStr;
}
