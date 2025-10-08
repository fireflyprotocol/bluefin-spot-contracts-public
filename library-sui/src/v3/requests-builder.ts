import { sha256 } from "@noble/hashes/sha256";
import { BIGNUMBER_BASE_ON_CHAIN, SUI_NATIVE_BASE } from "../constants";
import { bigNumber, toBigNumberStr } from "../library";
import { BigNumberable, Signer } from "../types";
import {
    IAdjustLeverage,
    IAdjustMargin,
    IApplyFundingRate,
    IAuthorizeUser,
    IDeployment,
    ILiquidate,
    IMarketFundingRate,
    IOrder,
    IPruneTable,
    IRequestPayload,
    ISetFundingRate,
    IWithdrawal
} from "./interfaces";
import { IOrderCreation } from "./interfaces/IOrder";
import { Address, NumStr, SupportedAssets } from "./types";
import { DeploymentParser, Signature, generateSalt } from "./utils";
import {
    AdjustLeverage,
    AdjustMargin,
    ApplyFundingRate,
    AuthorizeUser,
    BCSUtils,
    Liquidate,
    MarketFundingRate,
    Order,
    PruneTable,
    SetFundingRate,
    Withdrawal
} from "./utils/bcs";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { PRUNE_TABLES } from "./enums";

export class RequestsBuilder {
    parser: DeploymentParser;
    signer: Signer;
    walletAddress: string;

    /**
     * Class constructor
     * @param _deployment the deployment config
     * @param _signer the wallet/signer
     * @param _walletAddress (optional) the wallet/signer address
     */
    constructor(_deployment: IDeployment, _signer: Signer, _walletAddress?: Address) {
        this.parser = new DeploymentParser(_deployment);
        this.signer = _signer as Signer;
        this.walletAddress = _walletAddress || (_signer?.toSuiAddress() as string);
    }

    /**
     * Create a withdrawal request for user to submit to bluefin gateway
     * @param assetSymbol name of the asset to be withdrawn
     * @param amountE9 amount to be withdrawn. Should be in 9 decimal places
     * @param options Optional params:
     * - salt: A random number to make the withdrawal payload unique for the user
     * - account: The address of the account performing the withdraw
     * - assetBankID: The address of the asset bank. By default fetches the asset bank of the provided asset symbol
     * @returns IRequestPayload
     */
    public async withdrawal(
        assetSymbol: SupportedAssets,
        amountE9: BigNumberable,
        options?: {
            salt?: NumStr;
            account?: Address;
            assetBankID?: Address;
            signer?: Signer;
        }
    ): Promise<IRequestPayload> {
        // build withdrawal request payload
        const rawData: IWithdrawal = {
            assetSymbol,
            assetBankID: options?.assetBankID || this.parser.getAssetBank(assetSymbol),
            account: options?.account || this.walletAddress,
            amount: bigNumber(amountE9).toFixed(0),
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, Withdrawal);

        // sign the payload
        const signature = await Signature.signDataHex(
            options?.signer || this.signer,
            serializedData,
            true
        );

        return { rawData, serializedData, signature };
    }

    /**
     * Create a withdrawal request for user to submit to bluefin gateway
     * @param user The address of the account to be authorized or unauthorized
     * @param status a boolean indicating if the users are to be authorized or not
     * @param options Optional params:
     * - account: The account for which to authorize users - defaults to Parent_1
     * - salt: A random number to make the withdrawal payload unique for the user
     * @returns IRequestPayload
     */
    public async authorizeUser(
        user: Address,
        status: boolean,
        options?: { signer?: Signer; account?: Address; salt?: NumStr }
    ): Promise<IRequestPayload> {
        // build withdrawal request payload
        const rawData: IAuthorizeUser = {
            account: options?.account || this.walletAddress,
            user,
            status,
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, AuthorizeUser);

        // sign the payload
        const signature = await Signature.signDataHex(
            options?.signer || this.signer,
            serializedData,
            true
        );

        return { rawData, serializedData, signature };
    }

    /**
     * Creates a signed order
     * @param orderParams Params for order creation
     * @param signer (optional) The signer to be used for signing the order
     * @returns IRequestPayload
     */
    public async createSignedOrder(
        orderParams: IOrderCreation,
        signer?: Signer
    ): Promise<IRequestPayload> {
        signer = signer || this.signer;

        // build order
        const rawData: IOrder = {
            accountAddress: orderParams.accountAddress
                ? orderParams.accountAddress
                : signer.toSuiAddress(),

            marketAddress:
                orderParams.marketAddress || this.parser.getPerpetualAddress("ETH-PERP"),

            price: toBigNumberStr(
                orderParams.price != undefined ? orderParams.price : 3500,
                SUI_NATIVE_BASE
            ),
            quantity: toBigNumberStr(
                orderParams.quantity != undefined ? orderParams.quantity : 0.1,
                SUI_NATIVE_BASE
            ),
            leverage: toBigNumberStr(
                orderParams.leverage != undefined ? orderParams.leverage : 0,
                SUI_NATIVE_BASE
            ),
            side: orderParams.side || "LONG",
            isIsolated: orderParams.isIsolated || false,
            expiration: orderParams.expiration || 2037603360000,
            salt: orderParams.salt || generateSalt(),
            signedAt: orderParams.signedAt || Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, Order);

        const hash = bytesToHex(sha256(hexToBytes(serializedData)));

        // sign the payload
        const signature = await Signature.signDataHex(signer, hash, false);

        return { rawData: { ...rawData, hash, signature }, serializedData, signature };
    }

    /**
     * Create a liquidation request for user to submit to bluefin gateway
     * @param liquidatee The address of the account to be liquidated
     * @param marketAddress The address of the market/perpetual for which to liquidate user's position
     * @param quantityE9 The amount to be liquidated
     * @param isolated True if the position being liquidated is isolated
     * @param assumeAsCross True if the position is to be assumed as cross position after liquidation
     * @param options Optional params:
     * - signer: The signer to be used to sign the payload. Defaults to signer of the class (this.signer)
     * - liquidator: The address of the liquidator. Defaults to the signer address
     * - allOrNothing: True if the complete specified amount must be liquidated, false otherwise. Defaults to False
     * - assumeAsCross: True if the
     * - salt: A random number to make the withdrawal payload unique for the user
     * - expiry: The timestamp till which the signed liquidation is valid
     * - leverage: If assuming as an isolated position, specify the leverage. Defaults to 1 for isolated position, and passed as 0 for cross.
     * @returns IRequestPayload
     */
    public async createSignedLiquidation(
        liquidatee: Address,
        marketAddress: Address,
        isolated: boolean,
        assumeAsCross: boolean,
        quantityE9: BigNumberable,
        options?: {
            signer?: Signer;
            liquidator?: Address;
            salt?: NumStr;
            allOrNothing?: boolean;
            expiry?: NumStr;
            leverageE9?: BigNumberable;
        }
    ): Promise<IRequestPayload> {
        const signer = options?.signer || this.signer;
        const liquidator = options?.liquidator || signer.toSuiAddress();
        const allOrNothing = options?.allOrNothing == true;
        const leverageE9 = assumeAsCross
            ? 0
            : options?.leverageE9 || BIGNUMBER_BASE_ON_CHAIN;
        const expiry = options?.expiry || 2037603360000;
        const salt = options?.salt || generateSalt();

        // build liquidate request payload
        const rawData: ILiquidate = {
            liquidatee,
            liquidator,
            marketAddress,
            quantity: bigNumber(quantityE9).toFixed(0),
            isolated,
            assumeAsCross,
            leverage: bigNumber(leverageE9).toFixed(0),
            allOrNothing,
            expiry,
            salt,
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, Liquidate);

        // sign the payload
        const signature = await Signature.signDataHex(signer, serializedData, true);

        return { rawData, serializedData, signature };
    }

    /**
     * Create a adjust margin request for user to submit to bluefin gateway
     * @param marketAddress The address of the market/perpetual for which to adjust the margin
     * @param amountE9 The amount to be added/withdrawn from isolated position
     * @param options Optional params:
     * - account: The account address for which margin to be adjusted. The account defaults to `this.walletAddress`
     * - signer: The signer to be used to sign the payload. Defaults to signer of the class `this.signer`
     * - salt: A random number to make the withdrawal payload unique for the user
     * @returns IRequestPayload
     */
    public async adjustMargin(
        marketAddress: Address,
        add: boolean,
        amountE9: BigNumberable,
        options?: { account?: Address; signer?: Signer; salt?: NumStr }
    ): Promise<IRequestPayload> {
        const signer = options?.signer || this.signer;
        const account = options?.account || this.walletAddress;

        // build adjust margin request payload
        const rawData: IAdjustMargin = {
            account,
            marketAddress,
            add,
            amount: bigNumber(amountE9).toFixed(0),
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, AdjustMargin);
        // sign the payload
        const signature = await Signature.signDataHex(signer, serializedData, true);

        return { rawData, serializedData, signature };
    }

    /**
     * Create a adjust leverage request for user to submit to bluefin gateway
     * @param marketAddress The address of the market/perpetual for which to adjust the leverage
     * @param leverage The new leverage to be used
     * @param options Optional params:
     * - account: The account address for which margin to be adjusted. The account defaults to `this.walletAddress`
     * - signer: The signer to be used to sign the payload. Defaults to signer of the class `this.signer`
     * - salt: A random number to make the withdrawal payload unique for the user
     * @returns IRequestPayload
     */
    public async adjustLeverage(
        marketAddress: Address,
        leverage: BigNumberable,
        options?: { account?: Address; signer?: Signer; salt?: NumStr }
    ): Promise<IRequestPayload> {
        const signer = options?.signer || this.signer;
        const account = options?.account || this.walletAddress;

        // build adjust leverage request payload
        const rawData: IAdjustLeverage = {
            account,
            marketAddress,
            leverage: bigNumber(leverage).toFixed(0),
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, AdjustLeverage);
        // sign the payload
        const signature = await Signature.signDataHex(signer, serializedData, true);

        return { rawData, serializedData, signature };
    }

    /**
     * Create a set funding rate request payload for the funding rate operator to submit to bluefin gateway
     * @param marketsFundingRates The funding rate of each market/perpetual along with the market address
     * @param options Optional params:
     * - signer: The signer to be used to sign the payload. Defaults to signer of the class `this.signer`
     * - salt: A random number to make the withdrawal payload unique for the user
     * - timestamp: The timestamp in seconds for which the funding rate is being set.
     *   This should be hourly timestamp. If not provided the method takes current
     *   time and rounds it up/down to closest hour mark
     * @returns IRequestPayload
     */
    public async setFundingRate(
        marketsFundingRates: Array<IMarketFundingRate>,
        options?: { signer?: Signer; salt?: NumStr; timestamp?: NumStr }
    ): Promise<IRequestPayload> {
        const signer = options?.signer || this.signer;

        const timestamp =
            options?.timestamp ||
            new Date(3600000 * (1 + Math.round(Date.now() / 3600000))).getTime() / 1000;

        const fundingRates = marketsFundingRates.map(mfr =>
            BCSUtils.getSerializedDataBytes(mfr, MarketFundingRate)
        );

        // build withdrawal request payload
        const rawData: ISetFundingRate = {
            timestamp,
            marketFundingRates: fundingRates,
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, SetFundingRate);
        // sign the payload
        const signature = await Signature.signDataHex(signer, serializedData, true);

        return { rawData, serializedData, signature };
    }

    /**
     * Create bcs serialized payload for applying funding rate
     * @param accounts The array of account addresses to which to apply funding rate
     * @param options Optional params:
     * - ids: The address/id of the internal data store - This makes sure that a payload signed for testnet can not be executed on mainnet
     * - salt: A random number to make the withdrawal payload unique for the user
     * - timestamp: The timestamp in seconds for which the funding rate is to be applied
     *   This should be hourly timestamp. If not provided the method takes current
     *   time and rounds it up/down to closest hour mark
     * @returns IRequestPayload
     */
    public async applyFundingRate(
        accounts: Array<Address>,
        options?: { ids?: Address; salt?: NumStr; timestamp?: NumStr }
    ) {
        const timestamp =
            options?.timestamp ||
            new Date(3600000 * (1 + Math.round(Date.now() / 3600000))).getTime() / 1000;

        // build withdrawal request payload
        const rawData: IApplyFundingRate = {
            ids: options?.ids || this.parser.getInternalDataStore(),
            timestamp,
            accounts,
            salt: options?.salt || generateSalt(),
            signedAt: Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, ApplyFundingRate);

        return { rawData, serializedData, signature: undefined };
    }

    /**
     * Creates a prune table payload and signs it
     * @param hashes The list of hashes that are to be pruned
     * @param type The table type from which the hashes are to be pruned
     * @param options Optional params:
     * - signer: The signer to be used to sign the payload. Defaults to signer of the class `this.signer`
     * - salt: A random number to make the withdrawal payload unique for the user
     * @returns IRequestPayload
     */
    public async pruneTable(
        hashes: Array<Uint8Array>,
        type: PRUNE_TABLES,
        options?: { signer?: Signer; salt?: NumStr; signedAt?: NumStr }
    ): Promise<IRequestPayload> {
        const signer = options?.signer || this.signer;

        // build withdrawal request payload
        const rawData: IPruneTable = {
            hashes,
            type,
            salt: options?.salt || generateSalt(),
            signedAt: options?.signedAt || Date.now()
        };

        // serialize the payload
        const serializedData = BCSUtils.getSerializedDataHex(rawData, PruneTable);
        // sign the payload
        const signature = await Signature.signDataHex(signer, serializedData, true);

        return { rawData, serializedData, signature };
    }
}
