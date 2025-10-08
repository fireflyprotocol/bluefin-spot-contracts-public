import { CoinUtils } from "../../classes";
import { bigNumber } from "../../library";
import { BigNumberable, OnChainCallResponse } from "../../types";
import { IBluefinV3OptionalParams } from "../interfaces";
import { SupportedAssets } from "../types";
import { OnChainCalls } from "./on-chain-calls";

export class UserCalls extends OnChainCalls {
    /**
     * Allows users to deposit coins into the external bank
     * @param assetSymbol name of the asset to be deposited
     * @param amountE9 quantity of USDC to be deposited. Should be in 9 decimal places
     * @param options Optional tx execution params AND
     *  - asset: the name of the asset to be deposited - defaults to USDC
     *  - account: the address of the account to deposit money into. `Alice` can deposit funds to `Bob`'s account
     *  - coinId: the id of supported USDC coin to be used for deposits. Please ensure that the coin has enough balance.
     * @returns OnChainCallResponse
     */
    async depositToAssetBank(
        assetSymbol: SupportedAssets,
        amountE9: BigNumberable,
        options?: IBluefinV3OptionalParams & {
            asset?: SupportedAssets;
            account?: string;
            coinId?: string;
        }
    ): Promise<OnChainCallResponse> {
        const account = options?.account || this.walletAddress;
        const currency = this.parser.getCurrency(assetSymbol);

        let coinID = options?.coinId;
        // if no coin id is provided, search for the coin that user holds
        // having balance >= amount
        if (!coinID) {
            const [coin] = await CoinUtils.getCoinHavingBalance(
                this.suiClient,
                bigNumber(amountE9).shiftedBy(-3), // convert from 9 decimals to 6 as USDC has 6 decimal places
                this.walletAddress,
                currency
            );
            coinID = coin.coinObjectId;
        }

        const txb = this.txBuilder.depositToAssetBank(
            assetSymbol,
            account,
            amountE9,
            coinID,
            options
        );

        return this.execCall(txb, options);
    }
}
