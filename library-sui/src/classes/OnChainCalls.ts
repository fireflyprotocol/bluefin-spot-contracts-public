/* eslint-disable no-shadow-restricted-names */
import {
    DryRunTransactionBlockResponse,
    SuiClient,
    SuiObjectResponse,
    SuiTransactionBlockResponseOptions
} from "@mysten/sui/client";

import { fromB64, SUI_CLOCK_OBJECT_ID, toB64 } from "@mysten/sui/utils";

import { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { SignatureWithBytes, Signer } from "@mysten/sui/cryptography";
import { sha256 } from "@noble/hashes/sha256";
import BigNumber from "bignumber.js";
import { SUI_NATIVE_BASE, USDC_BASE_DECIMALS } from "../constants";
import { DEFAULT } from "../defaults";
import {
    BankAccountDetails,
    DecodeJWT,
    ExtendedWalletContextState,
    Operator,
    Order,
    PerpCreationMarketDetails,
    UserPosition,
    ZkPayload
} from "../interfaces";
import {
    base64ToUint8,
    bigNumber,
    encodeOrderFlags,
    hexStrToUint8,
    hexToString,
    toBigNumber,
    toBigNumberStr,
    usdcToBaseNumber
} from "../library";
import {
    address,
    BigNumberable,
    Keypair,
    PartialZkLoginSignature,
    TransactionBlock
} from "../types";
import { createZkSignature, getSalt } from "../utils";
import {
    isTransaction,
    SerialTransactionExecutor,
    TransactionResult
} from "@mysten/sui/transactions";
import { TRANSFERABLE_COINS } from "../enums";

export class OnChainCalls {
    signer: Signer;
    settlementCap: string | undefined;
    deployment: any;
    private suiClient: SuiClient;
    private is_zkLogin: boolean;
    private maxEpoch?: number;
    private proof?: PartialZkLoginSignature;
    private decodedJWT?: DecodeJWT;
    private salt?: string;
    private walletAddress?: string;
    private is_wallet_extension: boolean;
    private sequentialExecutors: SerialTransactionExecutor;

    constructor(
        _signer: Signer,
        _deployment: any,
        suiClient: SuiClient,
        isZkLogin = false,
        zkPayload?: ZkPayload,
        walletAddress?: string,
        is_wallet_extension = false,
        settlementCap?: string
    ) {
        this.signer = _signer;
        this.deployment = _deployment;
        this.is_zkLogin = isZkLogin;
        if (isZkLogin && zkPayload) {
            this.maxEpoch = zkPayload.maxEpoch;
            this.proof = zkPayload.proof;
            this.decodedJWT = zkPayload.decodedJWT;
            this.salt = zkPayload.salt;
        }
        this.walletAddress = walletAddress || _signer.toSuiAddress();
        this.settlementCap = settlementCap;
        this.suiClient = suiClient;
        this.is_wallet_extension = is_wallet_extension;
        this.sequentialExecutors = new SerialTransactionExecutor({
            client: this.suiClient,
            signer: this.signer
        });
    }

    public async setExchangeAdmin(
        args: {
            address: string;
            adminID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();
        const callArgs = [];
        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.pure.address(args.address));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_exchange_admin`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setExchangeGuardian(
        args: {
            address: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();
        const callArgs = [];
        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.pure.address(args.address));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_exchange_guardian`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setFundingRateOperator(
        args: {
            operator: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();
        const callArgs = [];
        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.pure.address(args.operator));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_funding_rate_operator_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setPreLaunchMarketStatus(
        args: {
            status: boolean;
            market: string;
            adminID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.bool(args.status));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_pre_launch_status`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setPreLaunchOraclePriceOperator(
        args: {
            operator: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();
        const callArgs = [];
        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.pure.address(args.operator));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_pre_launch_oracle_operator`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setPreLaunchMarketOraclePrice(
        args: {
            price: number;
            market?: string;
            safeID?: string;
            gasBudget?: number;
            coinObjectId?: string;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();
        const callArgs = [];
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(args.price));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        if (args.coinObjectId) {
            const coinObject = await this.getOnChainObject(args.coinObjectId);
            tx.setGasPayment([coinObject.data]);
        }

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_oracle_price`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async createPerpetual(
        args: PerpCreationMarketDetails,
        signer?: Signer,
        gasBudget?: number
    ): Promise<SuiTransactionBlockResponse> {
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));

        callArgs.push(tx.object(this.getBankID()));

        callArgs.push(tx.pure.string(args.symbol || "ETH-PERP"));

        callArgs.push(tx.pure.u128(args.minOrderPrice || toBigNumberStr(0.1)));
        callArgs.push(tx.pure.u128(args.maxOrderPrice || toBigNumberStr(100000)));
        callArgs.push(tx.pure.u128(args.tickSize || toBigNumberStr(0.001)));
        callArgs.push(tx.pure.u128(args.minTradeQty || toBigNumberStr(0.1)));

        callArgs.push(tx.pure.u128(args.maxTradeQtyLimit || toBigNumberStr(100000)));
        callArgs.push(tx.pure.u128(args.maxTradeQtyMarket || toBigNumberStr(1000)));
        callArgs.push(tx.pure.u128(args.stepSize || toBigNumberStr(0.1)));
        callArgs.push(tx.pure.u128(args.mtbLong || toBigNumberStr(0.2)));
        callArgs.push(tx.pure.u128(args.mtbShort || toBigNumberStr(0.2)));
        callArgs.push(
            tx.pure.vector(
                "u128",
                args.maxAllowedOIOpen || [
                    toBigNumberStr(1_000_000), //1x
                    toBigNumberStr(1_000_000), //2x
                    toBigNumberStr(500_000), //3x
                    toBigNumberStr(500_000), //4x
                    toBigNumberStr(250_000), //5x
                    toBigNumberStr(250_000), //6x
                    toBigNumberStr(250_000), //7x
                    toBigNumberStr(250_000), //8x
                    toBigNumberStr(100_000), //9x
                    toBigNumberStr(100_000) //10x
                ]
            )
        );
        callArgs.push(tx.pure.u128(args.initialMarginReq || toBigNumberStr(0.1)));
        callArgs.push(tx.pure.u128(args.maintenanceMarginReq || toBigNumberStr(0.05)));

        callArgs.push(tx.pure.u128(args.defaultMakerFee || toBigNumberStr(0.001)));
        callArgs.push(tx.pure.u128(args.defaultTakerFee || toBigNumberStr(0.0045)));

        callArgs.push(tx.pure.u128(args.maxFundingRate || toBigNumberStr(0.001)));

        callArgs.push(tx.pure.u128(args.insurancePoolRatio || toBigNumberStr(0.3)));

        callArgs.push(
            tx.pure.address(
                args.insurancePool ? args.insurancePool : DEFAULT.INSURANCE_POOL_ADDRESS
            )
        );

        callArgs.push(
            tx.pure.address(args.feePool ? args.feePool : DEFAULT.FEE_POOL_ADDRESS)
        );

        // time stamp in ms
        callArgs.push(tx.pure.u64(args.tradingStartTime || Date.now()));

        //Price Info Feed id converted from Hex String to just string
        callArgs.push(tx.pure.string(hexToString(args.priceInfoFeedId)));

        const caller = signer || this.signer;

        if (gasBudget) tx.setGasBudget(gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::exchange::create_perpetual`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMinPrice(
        args: {
            adminID?: string;
            market?: string;
            minPrice: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.minPrice)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_min_price_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaxPrice(
        args: {
            adminID?: string;
            market?: string;
            maxPrice: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];
        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.maxPrice)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_max_price_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setStepSize(
        args: {
            adminID?: string;
            market?: string;
            stepSize: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.stepSize)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_step_size_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setTickSize(
        args: {
            adminID?: string;
            market?: string;
            tickSize: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.tickSize)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_tick_size_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMTBLong(
        args: {
            adminID?: string;
            market?: string;
            mtbLong: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.mtbLong)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_mtb_long_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMTBShort(
        args: {
            adminID?: string;
            market?: string;
            mtbShort: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.mtbShort)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_mtb_short_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaxQtyLimit(
        args: {
            adminID?: string;
            market?: string;
            maxQtyLimit: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.maxQtyLimit)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_max_qty_limit_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaxQtyMarket(
        args: {
            adminID?: string;
            market?: string;
            maxQtyMarket: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.maxQtyMarket)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_max_qty_market_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMinQty(
        args: {
            adminID?: string;
            market?: string;
            minQty: number;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.minQty)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_min_qty_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaxAllowedOIOpen(
        args: {
            adminID?: string;
            market?: string;
            maxLimit: string[];
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.vector("u128", args.maxLimit));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_max_oi_open_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaintenanceMarginRequired(
        args: {
            adminID?: string;
            market?: string;
            mmr: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(args.mmr));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_maintenance_margin_required_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setInitialMarginRequired(
        args: {
            adminID?: string;
            market?: string;
            imr: string;
        },
        options?: {
            gasBudget?: number;
            signer?: Signer;
            multiSig?: address;
        }
    ): Promise<SuiTransactionBlockResponse | string> {
        const caller = options?.signer || this.signer;

        const txb = new TransactionBlock();
        const callArgs = [];

        callArgs.push(txb.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(txb.object(this.getPerpetualID(args.market)));

        callArgs.push(txb.pure.u128(args.imr));

        if (options?.gasBudget) txb.setGasBudget(options?.gasBudget);

        txb.moveCall({
            arguments: callArgs,
            target: `${this.getPackageID()}::perpetual::set_initial_margin_required_v2`
        });

        // if multi sig call return tx bytes
        if (options?.multiSig) {
            txb.setSender(options?.multiSig);
            return toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
        } else {
            return this.executeTxBlock(txb, caller);
        }
    }

    public async createSettlementOperator(
        args: {
            operator: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        options?: {
            gasBudget?: number;
            signer?: Signer;
            multiSig?: address;
        }
    ) {
        const caller = options?.signer || this.signer;
        const callArgs = [];

        const txb = new TransactionBlock();

        callArgs.push(txb.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(txb.object(args.safeID || this.getSafeID()));
        callArgs.push(txb.pure.address(args.operator));

        if (options?.gasBudget) txb.setGasBudget(options?.gasBudget);

        txb.moveCall({
            arguments: callArgs,
            target: `${this.getPackageID()}::roles::create_settlement_operator`
        });

        // if multi sig call return tx bytes
        if (options?.multiSig) {
            txb.setSender(options?.multiSig);
            return toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
        } else {
            return this.executeTxBlock(txb, caller);
        }
    }

    public async removeSettlementOperator(
        args: {
            capID: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.object(args.capID));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::remove_settlement_operator`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setFeePoolAddress(
        args: {
            adminID?: string;
            market?: string;
            address: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.address(args.address));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_fee_pool_address_v2`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setInsurancePoolAddress(
        args: {
            adminID?: string;
            market?: string;
            address: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.address(args.address));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_insurance_pool_address_v2`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setInsurancePoolPercentage(
        args: {
            adminID?: string;
            market?: string;
            percentage: number;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.percentage)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_insurance_pool_percentage_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setMaxAllowedFundingRate(
        args: {
            adminID?: string;
            market?: string;
            maxFundingRate: number;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;
        const callArgs = [];

        const tx = new TransactionBlock();

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.maxFundingRate)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_max_allowed_funding_rate_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async trade(
        args: {
            makerOrder: Order;
            makerSignature: string;
            makerPublicKey: string;
            takerOrder: Order;
            takerSignature: string;
            takerPublicKey: string;
            settlementCapID?: string;
            fillPrice?: BigNumber;
            fillQuantity?: BigNumber;
            perpID?: string;
            safeID?: string;
            bankID?: string;
            subAccountsMapID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const txBlock = new TransactionBlock();

        const callArgs = [
            txBlock.object(SUI_CLOCK_OBJECT_ID),
            txBlock.object(args.perpID || this.getPerpetualID(args.market)),
            txBlock.object(args.bankID || this.getBankID()),
            txBlock.object(args.safeID || this.getSafeID()),
            txBlock.object(args.subAccountsMapID || this.getSubAccountsID()),
            txBlock.object(this.getOrdersTableID()),
            txBlock.object(this.getSequencer()),
            txBlock.object(args.settlementCapID || this.settlementCap),

            txBlock.object(this.getPriceOracleObjectId(args.market)),

            txBlock.pure.u8(encodeOrderFlags(args.makerOrder)),
            txBlock.pure.u128(args.makerOrder.price.toFixed(0)),
            txBlock.pure.u128(args.makerOrder.quantity.toFixed(0)),
            txBlock.pure.u128(args.makerOrder.leverage.toFixed(0)),
            txBlock.pure.u64(args.makerOrder.expiration.toFixed(0)),
            txBlock.pure.u128(args.makerOrder.salt.toFixed(0)),
            txBlock.pure.address(args.makerOrder.maker),
            txBlock.pure.vector("u8", Array.from(hexStrToUint8(args.makerSignature))),
            txBlock.pure.vector("u8", Array.from(base64ToUint8(args.makerPublicKey))),
            txBlock.pure.u8(encodeOrderFlags(args.takerOrder)),
            txBlock.pure.u128(args.takerOrder.price.toFixed(0)),
            txBlock.pure.u128(args.takerOrder.quantity.toFixed(0)),
            txBlock.pure.u128(args.takerOrder.leverage.toFixed(0)),
            txBlock.pure.u64(args.takerOrder.expiration.toFixed(0)),
            txBlock.pure.u128(args.takerOrder.salt.toFixed(0)),
            txBlock.pure.address(args.takerOrder.maker),
            txBlock.pure.vector("u8", Array.from(hexStrToUint8(args.takerSignature))),
            txBlock.pure.vector("u8", Array.from(base64ToUint8(args.takerPublicKey))),

            txBlock.pure.u128(
                args.fillQuantity
                    ? args.fillQuantity.toFixed(0)
                    : args.makerOrder.quantity.lte(args.takerOrder.quantity)
                    ? args.makerOrder.quantity.toFixed(0)
                    : args.takerOrder.quantity.toFixed(0)
            ),

            txBlock.pure.u128(
                args.fillPrice
                    ? args.fillPrice.toFixed(0)
                    : args.makerOrder.price.toFixed(0)
            )
        ];

        //need to check it again. On contract this is of vector type
        callArgs.push(
            txBlock.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        if (args.gasBudget) txBlock.setGasBudget(args.gasBudget);

        txBlock.moveCall({
            target: `${this.getPackageID()}::exchange::trade`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, txBlock);
    }

    public async batchTrade(
        args: {
            makerOrder: Order;
            makerSignature: string;
            makerPublicKey: string;
            takerOrder: Order;
            takerSignature: string;
            takerPublicKey: string;
            settlementCapID?: string;
            fillPrice?: BigNumber;
            fillQuantity?: BigNumber;
            perpID?: string;
            safeID?: string;
            bankID?: string;
            subAccountsMapID?: string;
            market?: string;
            txHash?: string;
        }[],
        options?: {
            gasBudget?: number;
            signer?: Signer;
            transactionBlock?: TransactionBlock;
        }
    ): Promise<SuiTransactionBlockResponse> {
        const caller = options?.signer || this.signer;

        let txBlock = options?.transactionBlock;

        if (!options?.transactionBlock) {
            txBlock = await this.buildBatchTradeTxBlock(args);
        }

        if (options?.gasBudget) txBlock.setGasBudget(options.gasBudget);

        return this.executeTxBlock(txBlock, caller);
    }

    public async batchTradeUsingExecutors(
        args: {
            makerOrder: Order;
            makerSignature: string;
            makerPublicKey: string;
            takerOrder: Order;
            takerSignature: string;
            takerPublicKey: string;
            settlementCapID?: string;
            fillPrice?: BigNumber;
            fillQuantity?: BigNumber;
            perpID?: string;
            safeID?: string;
            bankID?: string;
            subAccountsMapID?: string;
            market?: string;
            txHash?: string;
        }[],
        options?: {
            gasBudget?: number;
            transactionBlock?: TransactionBlock;
        }
    ): Promise<SuiTransactionBlockResponse> {
        const caller = this.signer;

        let txBlock = options?.transactionBlock;

        if (!options?.transactionBlock) {
            txBlock = await this.buildBatchTradeTxBlock(args);
        }

        if (options?.gasBudget) txBlock.setGasBudget(options.gasBudget);

        const result = (
            await this.sequentialExecutors.executeTransaction(txBlock, {
                showEvents: true,
                showEffects: true
            })
        ).data;

        return result;
    }

    public async buildBatchTradeTxBlock(
        args: {
            makerOrder: Order;
            makerSignature: string;
            makerPublicKey: string;
            takerOrder: Order;
            takerSignature: string;
            takerPublicKey: string;
            settlementCapID?: string;
            fillPrice?: BigNumber;
            fillQuantity?: BigNumber;
            perpID?: string;
            safeID?: string;
            bankID?: string;
            subAccountsMapID?: string;
            market?: string;
            txHash?: string;
        }[],
        gasBudget?: number
    ): Promise<TransactionBlock> {
        const txBlock = new TransactionBlock();

        for (const arg of args) {
            const callArgs = [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(arg.perpID || this.getPerpetualID(arg.market)),
                txBlock.object(arg.bankID || this.getBankID()),
                txBlock.object(arg.safeID || this.getSafeID()),
                txBlock.object(arg.subAccountsMapID || this.getSubAccountsID()),
                txBlock.object(this.getOrdersTableID()),
                txBlock.object(this.getSequencer()),
                txBlock.object(arg.settlementCapID || this.settlementCap),

                txBlock.object(this.getPriceOracleObjectId(arg.market)),

                txBlock.pure.u8(encodeOrderFlags(arg.makerOrder)),
                txBlock.pure.u128(arg.makerOrder.price.toFixed(0)),
                txBlock.pure.u128(arg.makerOrder.quantity.toFixed(0)),
                txBlock.pure.u128(arg.makerOrder.leverage.toFixed(0)),
                txBlock.pure.u64(arg.makerOrder.expiration.toFixed(0)),
                txBlock.pure.u128(arg.makerOrder.salt.toFixed(0)),
                txBlock.pure.address(arg.makerOrder.maker),
                txBlock.pure.vector("u8", Array.from(hexStrToUint8(arg.makerSignature))),
                txBlock.pure.vector("u8", Array.from(base64ToUint8(arg.makerPublicKey))),
                txBlock.pure.u8(encodeOrderFlags(arg.takerOrder)),
                txBlock.pure.u128(arg.takerOrder.price.toFixed(0)),
                txBlock.pure.u128(arg.takerOrder.quantity.toFixed(0)),
                txBlock.pure.u128(arg.takerOrder.leverage.toFixed(0)),
                txBlock.pure.u64(arg.takerOrder.expiration.toFixed(0)),
                txBlock.pure.u128(arg.takerOrder.salt.toFixed(0)),
                txBlock.pure.address(arg.takerOrder.maker),
                txBlock.pure.vector("u8", Array.from(hexStrToUint8(arg.takerSignature))),
                txBlock.pure.vector("u8", Array.from(base64ToUint8(arg.takerPublicKey))),

                txBlock.pure.u128(
                    arg.fillQuantity
                        ? arg.fillQuantity.toFixed(0)
                        : arg.makerOrder.quantity.lte(arg.takerOrder.quantity)
                        ? arg.makerOrder.quantity.toFixed(0)
                        : arg.takerOrder.quantity.toFixed(0)
                ),

                txBlock.pure.u128(
                    arg.fillPrice
                        ? arg.fillPrice.toFixed(0)
                        : arg.makerOrder.price.toFixed(0)
                )
            ];

            //need to check it again. On contract this is of vector type
            callArgs.push(
                txBlock.pure.string(
                    arg.txHash ||
                        Buffer.from(
                            sha256(JSON.stringify([...callArgs, getSalt()]))
                        ).toString("hex")
                )
            );

            txBlock.moveCall({
                target: `${this.getPackageID()}::exchange::trade`,
                arguments: callArgs,
                typeArguments: [this.getCurrencyType()]
            });
        }

        if (gasBudget) txBlock.setGasBudget(gasBudget);

        return txBlock;
    }

    public async liquidate(
        args: {
            perpID?: string;
            liquidatee: string;
            quantity: string;
            leverage: string;
            liquidator?: string;
            allOrNothing?: boolean;
            subAccountsMapID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const txBlock = new TransactionBlock();

        const callArgs = [
            txBlock.object(SUI_CLOCK_OBJECT_ID),
            txBlock.object(args.perpID || this.getPerpetualID(args.market)),
            txBlock.object(this.getBankID()),
            txBlock.object(args.subAccountsMapID || this.getSubAccountsID()),
            txBlock.object(this.getSequencer()),
            txBlock.object(this.getPriceOracleObjectId(args.market)),

            txBlock.pure.address(args.liquidatee),
            txBlock.pure.address(args.liquidator || caller.toSuiAddress()),
            txBlock.pure.u128(args.quantity),
            txBlock.pure.u128(args.leverage),
            txBlock.pure.bool(args.allOrNothing === true)
        ];

        //need to check it again. On contract this is of vector type
        callArgs.push(
            txBlock.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        if (args.gasBudget) txBlock.setGasBudget(args.gasBudget);

        txBlock.moveCall({
            target: `${this.getPackageID()}::exchange::liquidate`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, txBlock);
    }

    public async getBatchLiquidationTransactionBlock(
        args: {
            perpID?: string;
            liquidatee: string;
            quantity: string;
            leverage: string;
            liquidator?: string;
            allOrNothing?: boolean;
            subAccountsMapID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        }[],
        gasBudget?: number,
        signer?: Signer
    ): Promise<TransactionBlock> {
        const caller = signer || this.signer;
        const txBlock = new TransactionBlock();
        for (const arg of args) {
            const callArgs = [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(arg.perpID || this.getPerpetualID(arg.market)),
                txBlock.object(this.getBankID()),
                txBlock.object(arg.subAccountsMapID || this.getSubAccountsID()),
                txBlock.object(this.getSequencer()),
                txBlock.object(this.getPriceOracleObjectId(arg.market)),

                txBlock.pure.address(arg.liquidatee),
                txBlock.pure.address(arg.liquidator || caller.toSuiAddress()),
                txBlock.pure.u128(arg.quantity),
                txBlock.pure.u128(arg.leverage),
                txBlock.pure.bool(arg.allOrNothing === true)
            ];

            //need to check it again. On contract this is of vector type
            callArgs.push(
                txBlock.pure.string(
                    arg.txHash ||
                        Buffer.from(
                            sha256(JSON.stringify([...callArgs, getSalt()]))
                        ).toString("hex")
                )
            );

            txBlock.moveCall({
                target: `${this.getPackageID()}::exchange::liquidate`,
                arguments: callArgs,
                typeArguments: [this.getCurrencyType()]
            });
        }
        if (gasBudget) txBlock.setGasBudget(gasBudget);
        return txBlock;
    }

    public async batchLiquidate(
        args: {
            perpID?: string;
            liquidatee: string;
            quantity: string;
            leverage: string;
            liquidator?: string;
            allOrNothing?: boolean;
            subAccountsMapID?: string;
            gasBudget?: number;
            market?: string;
        }[],
        gasBudget?: number,
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;
        const txBlock = await this.getBatchLiquidationTransactionBlock(
            args,
            gasBudget,
            signer
        );
        return this.executeTxBlock(txBlock, caller);
    }

    public async dryRun(
        txBlock: TransactionBlock,
        signer: Signer
    ): Promise<DryRunTransactionBlockResponse> {
        const caller = signer || this.signer;
        txBlock.setSenderIfNotSet(caller.toSuiAddress());
        const builtTransactionBlock = await txBlock.build({
            client: this.suiClient
        });
        return this.suiClient.dryRunTransactionBlock({
            transactionBlock: builtTransactionBlock
        });
    }

    public async deleverage(
        args: {
            maker: string;
            taker: string;
            quantity: string;
            allOrNothing?: boolean;
            perpID?: string;
            deleveragingCapID?: string;
            safeID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const txBlock = new TransactionBlock();

        const callArgs = [
            txBlock.object(SUI_CLOCK_OBJECT_ID),
            txBlock.object(args.perpID || this.getPerpetualID(args.market)),
            txBlock.object(this.getBankID()),
            txBlock.object(args.safeID || this.getSafeID()),
            txBlock.object(this.getSequencer()),

            txBlock.object(args.deleveragingCapID || this.getDeleveragingCapID()),
            txBlock.object(this.getPriceOracleObjectId(args.market)),

            txBlock.pure.address(args.maker),
            txBlock.pure.address(args.taker),
            txBlock.pure.u128(args.quantity),
            txBlock.pure.bool(args.allOrNothing === true)
        ];

        //need to check it again. On contract this is of vector type
        callArgs.push(
            txBlock.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        if (args.gasBudget) txBlock.setGasBudget(args.gasBudget);

        txBlock.moveCall({
            target: `${this.getPackageID()}::exchange::deleverage`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, txBlock);
    }

    public async getBatchDeleveragingTransactionBlock(
        args: {
            maker: string;
            taker: string;
            quantity: string;
            allOrNothing?: boolean;
            perpID?: string;
            deleveragingCapID?: string;
            safeID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        }[],
        gasBudget?: number,
        signer?: Signer
    ): Promise<TransactionBlock> {
        const caller = signer || this.signer;
        const txBlock = new TransactionBlock();
        for (const arg of args) {
            const callArgs = [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(arg.perpID || this.getPerpetualID(arg.market)),
                txBlock.object(this.getBankID()),
                txBlock.object(arg.safeID || this.getSafeID()),
                txBlock.object(this.getSequencer()),

                txBlock.object(arg.deleveragingCapID || this.getDeleveragingCapID()),
                txBlock.object(this.getPriceOracleObjectId(arg.market)),

                txBlock.pure.address(arg.maker),
                txBlock.pure.address(arg.taker),
                txBlock.pure.u128(arg.quantity),
                txBlock.pure.bool(arg.allOrNothing === true)
            ];

            //need to check it again. On contract this is of vector type
            callArgs.push(
                txBlock.pure.string(
                    arg.txHash ||
                        Buffer.from(
                            sha256(JSON.stringify([...callArgs, getSalt()]))
                        ).toString("hex")
                )
            );

            txBlock.moveCall({
                target: `${this.getPackageID()}::exchange::deleverage`,
                arguments: callArgs,
                typeArguments: [this.getCurrencyType()]
            });
        }
        if (gasBudget) txBlock.setGasBudget(gasBudget);

        txBlock.setSenderIfNotSet(caller.toSuiAddress());
        return txBlock;
    }

    public async batchDeleverage(
        args: {
            maker: string;
            taker: string;
            quantity: string;
            allOrNothing?: boolean;
            perpID?: string;
            deleveragingCapID?: string;
            safeID?: string;
            gasBudget?: number;
            market?: string;
            txHash?: string;
        }[],
        gasBudget?: number,
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;
        const txBlock = await this.getBatchDeleveragingTransactionBlock(
            args,
            gasBudget,
            signer
        );
        return this.executeTxBlock(txBlock, caller);
    }

    public async addMargin(
        args: {
            amount: number;
            account?: string;
            perpID?: string;
            subAccountsMapID?: string;
            market?: string;
            gasBudget?: number;
            txHash?: string;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse | TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.object(args.perpID || this.getPerpetualID(args.market)));
        callArgs.push(tx.object(this.getBankID()));

        callArgs.push(tx.object(args.subAccountsMapID || this.getSubAccountsID()));

        callArgs.push(tx.object(this.getSequencer()));

        callArgs.push(tx.object(this.getPriceOracleObjectId(args.market)));

        callArgs.push(tx.pure.address(args.account || caller.toSuiAddress()));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.amount)));

        callArgs.push(
            tx.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        const typeArgs = [this.getCurrencyType()];

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::add_margin`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::add_margin`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async removeMargin(
        args: {
            amount: number;
            account?: string;
            perpID?: string;
            subAccountsMapID?: string;
            market?: string;
            gasBudget?: number;
            txHash?: string;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse | TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.object(args.perpID || this.getPerpetualID(args.market)));
        callArgs.push(tx.object(this.getBankID()));
        callArgs.push(tx.object(args.subAccountsMapID || this.getSubAccountsID()));
        callArgs.push(tx.object(this.getSequencer()));
        callArgs.push(tx.object(this.getPriceOracleObjectId(args.market)));

        callArgs.push(tx.pure.address(args.account || caller.toSuiAddress()));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.amount)));

        callArgs.push(
            tx.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        const typeArgs = [this.getCurrencyType()];

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::remove_margin`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::remove_margin`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async adjustLeverage(
        args: {
            leverage: number;
            account?: string;
            perpID?: string;
            subAccountsMapID?: string;
            market?: string;
            gasBudget?: number;
            txHash?: string;
            sponsor?: boolean;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.object(args.perpID || this.getPerpetualID(args.market)));
        callArgs.push(tx.object(this.getBankID()));
        callArgs.push(tx.object(args.subAccountsMapID || this.getSubAccountsID()));

        callArgs.push(tx.object(this.getSequencer()));
        callArgs.push(tx.object(this.getPriceOracleObjectId(args.market)));

        callArgs.push(tx.pure.address(args.account || caller.toSuiAddress()));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.leverage)));

        callArgs.push(
            tx.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        const typeArgs = [this.getCurrencyType()];

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::adjust_leverage`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);

            tx.moveCall({
                target: `${this.getPackageID()}::exchange::adjust_leverage`,
                arguments: callArgs,
                typeArguments: typeArgs
            });

            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async signAdjustLeverage(
        args: {
            leverage: number;
            account?: string;
            perpID?: string;
            subAccountsMapID?: string;
            market?: string;
            gasBudget?: number;
            txHash?: string;
        },
        signer?: Signer
    ): Promise<SignatureWithBytes> {
        const caller = signer || this.signer;

        const txb = new TransactionBlock();
        txb.setSender(this.walletAddress ?? caller.toSuiAddress());
        if (args.gasBudget) txb.setGasBudget(args.gasBudget);

        const callArgs = [];

        callArgs.push(txb.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(txb.object(args.perpID || this.getPerpetualID(args.market)));
        callArgs.push(txb.object(this.getBankID()));
        callArgs.push(txb.object(args.subAccountsMapID || this.getSubAccountsID()));

        callArgs.push(txb.object(this.getSequencer()));
        callArgs.push(txb.object(this.getPriceOracleObjectId(args.market)));

        callArgs.push(txb.pure.address(args.account || caller.toSuiAddress()));
        callArgs.push(txb.pure.u128(toBigNumberStr(args.leverage)));

        callArgs.push(
            txb.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        txb.moveCall({
            arguments: callArgs,
            target: `${this.getPackageID()}::exchange::adjust_leverage`,
            typeArguments: [this.getCurrencyType()]
        });

        //ui wallet
        if (this.is_wallet_extension) {
            const response: { transactionBlockBytes: string; signature: string } = await (
                caller as unknown as ExtendedWalletContextState
            ).signTransactionBlock({ transactionBlock: txb });
            return {
                bytes: response.transactionBlockBytes,
                signature: response.signature
            };
        }
        //signer
        else {
            const bytes = toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
            return caller.signWithIntent(fromB64(bytes), "TransactionData");
        }
    }

    /**
     * Create signed transaction for whitelisting/removing of the subaccounts on-chain
     */
    public async signUpsertSubAccount(
        args: {
            account?: string;
            accountsToRemove?: Array<string>;
            subAccountsMapID?: string;
            gasBudget?: number;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SignatureWithBytes | TransactionBlock> {
        const caller = signer || this.signer;

        const txb = new TransactionBlock();
        txb.setSender(this.walletAddress ?? caller.toSuiAddress());
        if (args.gasBudget) txb.setGasBudget(args.gasBudget);

        if (args.account) {
            const callArgs = [];
            callArgs.push(txb.object(args.subAccountsMapID || this.getSubAccountsID()));
            callArgs.push(txb.pure.address(args.account));
            callArgs.push(txb.pure.bool(true));

            txb.moveCall({
                arguments: callArgs,
                target: `${this.getPackageID()}::roles::set_sub_account`
            });
        }

        for (const accountToRemove of args.accountsToRemove) {
            const callArgs = [];
            callArgs.push(txb.object(args.subAccountsMapID || this.getSubAccountsID()));
            callArgs.push(txb.pure.address(accountToRemove));
            callArgs.push(txb.pure.bool(false));

            txb.moveCall({
                arguments: callArgs,
                target: `${this.getPackageID()}::roles::set_sub_account`
            });
        }
        if (args.sponsor) {
            return txb;
        }

        if (this.is_wallet_extension) {
            const response: { transactionBlockBytes: string; signature: string } = await (
                caller as unknown as ExtendedWalletContextState
            ).signTransactionBlock({ transactionBlock: txb });
            return {
                bytes: response.transactionBlockBytes,
                signature: response.signature
            };
        } else {
            const bytes = toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
            return caller.signWithIntent(fromB64(bytes), "TransactionData");
        }
    }

    public async cancelOrder(
        args: {
            order: Order;
            signature: string;
            publicKey: string;
            subAccountsMapID?: string;
            gasBudget?: number;
            txHash?: string;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.subAccountsMapID || this.getSubAccountsID()));
        callArgs.push(tx.object(this.getSequencer())),
            callArgs.push(tx.object(this.getOrdersTableID()));

        callArgs.push(tx.pure.address(args.order.market));
        callArgs.push(tx.pure.u8(encodeOrderFlags(args.order)));
        callArgs.push(tx.pure.u128(args.order.price.toFixed(0)));
        callArgs.push(tx.pure.u128(args.order.quantity.toFixed(0)));
        callArgs.push(tx.pure.u128(args.order.leverage.toFixed(0)));
        callArgs.push(tx.pure.u64(args.order.expiration.toFixed(0)));
        callArgs.push(tx.pure.u128(args.order.salt.toFixed(0)));
        callArgs.push(tx.pure.address(args.order.maker));
        callArgs.push(tx.pure.vector("u8", Array.from(hexStrToUint8(args.signature))));
        callArgs.push(tx.pure.vector("u8", Array.from(base64ToUint8(args.publicKey))));

        callArgs.push(
            tx.pure.string(
                args.txHash ||
                    Buffer.from(
                        sha256(JSON.stringify([...callArgs, getSalt()]))
                    ).toString("hex")
            )
        );

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::order::cancel_order`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setFundingRate(
        args: {
            rate: BigNumber;
            safeID?: string;
            updateFRCapID?: string;
            perpID?: string;
            market?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.object(args.updateFRCapID || this.getFROperatorCapID()));
        callArgs.push(tx.object(args.perpID || this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(args.rate.absoluteValue().toString()));
        callArgs.push(tx.pure.bool(args.rate.isPositive()));
        callArgs.push(tx.object(this.getPriceOracleObjectId(args.market)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_funding_rate_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setDeleveragingOperator(
        args: {
            operator: string;
            adminID?: string;
            safeID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(args.safeID || this.getSafeID()));

        callArgs.push(tx.pure.address(args.operator));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_deleveraging_operator`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setSubAccount(
        args: {
            account: string;
            status: boolean;
            subAccountsMapID?: string;
            gasBudget?: number;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse | TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.subAccountsMapID || this.getSubAccountsID()));
        callArgs.push(tx.pure.address(args.account));
        callArgs.push(tx.pure.bool(args.status));

        tx.moveCall({
            target: `${this.getPackageID()}::roles::set_sub_account`,
            arguments: callArgs,
            typeArguments: []
        });

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());
            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);
            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async depositToBank(
        args: {
            coinID: string;
            amount: string;
            txHash?: string;
            accountAddress?: string;
            bankID?: string;
            gasBudget?: number;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse | TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.bankID ? args.bankID : this.getBankID()));
        callArgs.push(tx.object(this.getSequencer()));

        if (!args.txHash) {
            args.txHash = Buffer.from(
                sha256(
                    JSON.stringify([
                        args.bankID ? args.bankID : this.getBankID(),
                        this.getSequencer(),
                        getSalt(),
                        args.accountAddress || caller.toSuiAddress(),
                        args.amount,
                        args.coinID
                    ])
                )
            ).toString("hex");
        }

        callArgs.push(tx.pure.string(args.txHash));

        callArgs.push(tx.pure.address(args.accountAddress || caller.toSuiAddress()));
        callArgs.push(tx.pure.u64(args.amount));
        callArgs.push(tx.object(args.coinID));

        const typeArgs = [this.getCoinType()];

        tx.moveCall({
            target: `${this.getPackageID()}::margin_bank::deposit_to_bank`,
            arguments: callArgs,
            typeArguments: typeArgs
        });

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());
            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);
            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async setBankWithdrawalStatus(
        args: {
            isAllowed: boolean;
            bankID?: string;
            safeID?: string;
            guardianCap?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.object(args.guardianCap || this.getGuardianCap()));
        callArgs.push(tx.object(args.bankID || this.getBankID()));
        callArgs.push(tx.pure.bool(args.isAllowed));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::margin_bank::set_withdrawal_status`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async setPerpetualTradingPermit(
        args: {
            isPermitted: boolean;
            market?: string;
            safeID?: string;
            guardianCap?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.safeID || this.getSafeID()));
        callArgs.push(tx.object(args.guardianCap || this.getGuardianCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.bool(args.isPermitted));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_trading_permit_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async withdrawFromBank(
        args: {
            amount: string;
            accountAddress?: string;
            txHash?: string;
            bankID?: string;
            gasBudget?: number;
            sponsor?: boolean;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse | TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.bankID ? args.bankID : this.getBankID()));
        callArgs.push(tx.object(this.getSequencer()));

        if (!args.txHash) {
            args.txHash = Buffer.from(
                sha256(
                    JSON.stringify([
                        args.bankID ? args.bankID : this.getBankID(),
                        this.getSequencer(),
                        getSalt(),
                        args.accountAddress || caller.toSuiAddress(),
                        args.amount
                    ])
                )
            ).toString("hex");
        }

        callArgs.push(tx.pure.string(args.txHash));

        callArgs.push(tx.pure.address(args.accountAddress || caller.toSuiAddress()));
        callArgs.push(tx.pure.u128(args.amount));

        const typeArgs = [this.getCurrencyType()];

        tx.moveCall({
            target: `${this.getPackageID()}::margin_bank::withdraw_from_bank`,
            arguments: callArgs,
            typeArguments: typeArgs
        });

        if (args.sponsor) {
            tx.setSender(caller.toSuiAddress());
            return tx;
        } else {
            if (args.gasBudget) tx.setGasBudget(args.gasBudget);
            return this.executeTransactionBlock(caller, tx);
        }
    }

    public async withdrawAllMarginFromBank(
        signer?: Signer,
        walletAddress?: string,
        gasBudget?: number,
        bankID?: string,
        txHash?: string
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(bankID || this.getBankID()));
        callArgs.push(tx.object(this.getSequencer()));

        if (!txHash) {
            txHash = Buffer.from(
                sha256(
                    JSON.stringify([
                        bankID || this.getBankID(),
                        this.getSequencer(),
                        getSalt(),
                        walletAddress || caller.toSuiAddress()
                    ])
                )
            ).toString("hex");
        }

        callArgs.push(tx.pure.string(txHash));
        callArgs.push(tx.pure.address(walletAddress || caller.toSuiAddress()));

        if (gasBudget) tx.setGasBudget(gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::margin_bank::withdraw_all_margin_from_bank`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async delistPerpetual(
        args: {
            price: string;
            market?: string;
            adminID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(args.price));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::delist_perpetual_v2`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async closePosition(
        args?: {
            bankID?: string;
            perpID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args?.perpID || this.getPerpetualID()));
        callArgs.push(tx.object(args?.bankID || this.getBankID()));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::exchange::close_position`,
            arguments: callArgs,
            typeArguments: [this.getCurrencyType()]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /*
     * Removes empty position objects from on-chain position table
     * @param market: name of the market for which positions are to be removed
     * @param users: user addresses whose position are to be removed
     */
    public async removeEmptyPositions(
        args: {
            market: string;
            users: string[];
            gasBudget?: number;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];
        callArgs.push(tx.object(this.getSafeID()));
        callArgs.push(tx.object(this.getGuardianCap()));
        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.vector("address", args.users));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::remove_empty_positions`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /**
     * @notice Allows admin to update the default maker fee of a perpetual
     * @param args:
     *  market: name of the perpetual/market
     *  fee: the maker fee to be charged from user on each tx NOTE: should be in bps 1.5/2.5
     */
    public async setMakerFee(
        args: { market: string; fee: number; gasBudget?: number },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.fee, 14)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_maker_fee`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /**
     * @notice Allows admin to update the default taker fee of a perpetual
     * @param args:
     *  market: name of the perpetual/market
     *  fee: the taker fee to be charged from user on each tx NOTE: should be in bps 1.5/2.5
     */
    public async setTakerFee(
        args: { market: string; fee: number; gasBudget?: number },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(this.getExchangeAdminCap()));
        callArgs.push(tx.object(this.getPerpetualID(args.market)));
        callArgs.push(tx.pure.u128(toBigNumberStr(args.fee, 14)));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::perpetual::set_taker_fee`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /*
     * @notice allows exchange admin to set a specific maker/taker tx fee for a user
     * @param args:
     *  marketName: (optional) Name of the perpetual (ETH-PERP, BTC-PERP etc..) for which to set special fee
     *              Default is ETH-PERP
     *  account: address of the user
     *  status: status indicating if the maker/taker fee are to be applied or not
     *  makerFee the maker fee to be charged from user on each tx NOTE: should be in bps 1.5/2.5
     *  takerFee the taker fee to be charged from user on each tx NOTE: should be in bps 1.5/2.5
     *  adminID: (optional) exchange ownership object id
     *  gasBudget: (optional) the gas limit to be paid for call
     * @param signer: (optional) the caller performing the call
     */
    public async setSpecialFee(
        args: {
            adminID?: string;
            marketName?: string;
            account: string;
            status: boolean;
            makerFee: number;
            takerFee: number;
            gasBudget?: number;
        },
        options?: {
            gasBudget?: number;
            signer?: Signer;
            multiSig?: address;
        }
    ): Promise<SuiTransactionBlockResponse | string> {
        const caller = options?.signer || this.signer;

        const callArgs = [];

        const txb = new TransactionBlock();

        callArgs.push(txb.object(args.adminID || this.getExchangeAdminCap()));
        callArgs.push(txb.object(this.getPerpetualID(args.marketName)));
        callArgs.push(txb.pure.address(args.account));
        callArgs.push(txb.pure.bool(args.status));
        callArgs.push(txb.pure.u128(toBigNumberStr(args.makerFee, 14)));
        callArgs.push(txb.pure.u128(toBigNumberStr(args.takerFee, 14)));

        if (options?.gasBudget) txb.setGasBudget(options?.gasBudget);

        txb.moveCall({
            arguments: callArgs,
            target: `${this.getPackageID()}::perpetual::set_special_fee_v2`
        });

        // if multi sig call return tx bytes
        if (options?.multiSig) {
            txb.setSender(options?.multiSig);
            return toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
        } else {
            return this.executeTxBlock(txb, caller);
        }
    }

    async executeTxBlock(
        transactionBlock: TransactionBlock,
        signer?: Signer,
        options: SuiTransactionBlockResponseOptions = {
            showObjectChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true
        }
    ) {
        const caller = signer || this.signer;
        transactionBlock.setSenderIfNotSet(caller.toSuiAddress());
        const builtTransactionBlock = await transactionBlock.build({
            client: this.suiClient
        });
        const transactionSignature = await caller.signTransaction(builtTransactionBlock);
        return this.executeSignedTxBlock(
            builtTransactionBlock,
            transactionSignature.signature,
            options
        );
    }

    /**
     * Executes provided signed transaction block
     * @param blockBytes bytes of the tx block
     * @param signature signature of the block
     * @returns
     */
    public async executeSignedTxBlock(
        blockBytes: string | Uint8Array,
        signature: string,
        options: SuiTransactionBlockResponseOptions = {
            showObjectChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true
        }
    ) {
        return this.suiClient.executeTransactionBlock({
            transactionBlock: blockBytes,
            signature: signature,
            options
        });
    }

    /*
     * Note that this function will only work on Pyth fake contract
     * and can only be used for testing
     */
    public async createOracleObjects(signer?: Signer) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];
        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));

        tx.moveCall({
            target: `${this.getPackageID()}::price_info::create_price_obj`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /*
     * Creates the margin bank object
     * @param usdcAddress address of the coin supported by bank
     */
    public async createBank(usdcAddress: string, gasBudget?: number, signer?: Signer) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];
        callArgs.push(tx.object(this.getExchangeAdminCap()));
        callArgs.push(tx.pure.string(usdcAddress));

        if (gasBudget) tx.setGasBudget(gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::margin_bank::create_bank`,
            arguments: callArgs,
            typeArguments: [`${usdcAddress}::coin::COIN`]
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /*
     * Creates the sequencer object
     */
    public async createSequencer(signer?: Signer) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];
        callArgs.push(tx.object(this.getExchangeAdminCap()));

        tx.moveCall({
            target: `${this.getPackageID()}::roles::create_sequencer`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /*
     * @dev updates oracle price on pyth contract.
     * Note that this function will only work on our own deployed Fake Pyth contract
     */
    public async setOraclePrice(
        args: {
            price: number;
            confidence?: string;
            market?: string;
        },
        signer?: Signer
    ) {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];
        const pythPkg = this.getPythPkgId(args.market);
        callArgs.push(tx.object(this.getPriceOracleObjectId(args.market)));
        callArgs.push(tx.object(SUI_CLOCK_OBJECT_ID));
        callArgs.push(tx.pure.u64(args.price * 1e6));
        callArgs.push(tx.pure.u64(args.confidence || "10"));
        callArgs.push(
            tx.pure.string(hexToString(this.getPriceOracleFeedId(args.market)))
        );

        tx.moveCall({
            target: `${pythPkg}::price_info::update_price_info_object_for_test`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    /**
     * Returns price of oracle
     * @param market name of the market for which oracle price is to be fetched
     * @returns oracle price in base number
     */
    public async getOraclePrice(market?: string): Promise<number> {
        const id = this.getPriceOracleObjectId(market);
        const obj = await this.getOnChainObject(id);
        const fields = (obj.data?.content as any).fields.price_info.fields.price_feed
            .fields.price.fields;

        return (
            Number(fields.price.fields.magnitude) /
            Math.pow(10, Number(fields.expo.fields.magnitude))
        );
    }

    public async mintUSDC(
        args?: {
            amount?: string;
            to?: string;
            treasuryCapID?: string;
            gasBudget?: number;
        },
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const callArgs = [];

        callArgs.push(tx.object(args?.treasuryCapID || this.getTreasuryCapID()));

        callArgs.push(
            tx.pure.u64(args?.amount || toBigNumberStr(1_000_000_000, USDC_BASE_DECIMALS))
        );

        callArgs.push(tx.pure.address(args?.to || caller.toSuiAddress()));

        if (args.gasBudget) tx.setGasBudget(args.gasBudget);

        tx.moveCall({
            target: `${this.getPackageID()}::coin::mint`,
            arguments: callArgs,
            typeArguments: []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async getUSDCCoins(
        args?: {
            address?: string;
            currencyType?: string;
            limit?: number;
            cursor?: string;
        },
        signer?: Signer
    ): Promise<any> {
        const caller = signer || this.signer;
        const coins = await this.suiClient.getCoins({
            owner: args?.address || this.walletAddress || caller.toSuiAddress(),
            coinType: args?.currencyType || this.getCoinType(),
            cursor: args?.cursor ?? null,
            limit: args?.limit ?? null
        });

        return coins;
    }

    /**
     * Merges All USDC Coins to single coin
     * @param coinType [optional] coinType of USDC coin , if not provided will get from deployment json
     * @param signer the signer object of the wallet that owns USDC coins
     * @returns transaction result
     */

    async mergeAllUsdcCoins(
        coinType?: string,
        signer?: Signer | any,
        address?: string,
        sponsor?: boolean
    ) {
        const caller = signer || (this.signer as any);
        const tx = new TransactionBlock();
        const coins = await this.suiClient.getCoins({
            coinType: coinType || this.getCoinType(),
            owner: address || caller.toSuiAddress()
        });

        if (coins.data.length <= 1) {
            throw new Error("User must have at least two coins to perform merge");
        }

        const destCoinId = tx.object(coins.data[0].coinObjectId);
        // Get all source coinIds other than First One (dest Coin)
        const srcCoinIds = coins.data.slice(1).map((coin: any) => {
            return tx.object(coin.coinObjectId);
        });
        tx.mergeCoins(destCoinId, srcCoinIds);

        if (sponsor) {
            return tx;
        } else {
            return this.executeTransactionBlock(caller, tx);
        }
    }

    Z;

    /**
     * Prepare trasaction block for transferring SUI
     * @param to recipient wallet address
     * @param balance amount to transfer
     * @returns transaction block
     */

    async prepareTransactionForSUITransfer(
        to: string,
        balance: number,
        signer?: Signer | any
    ): Promise<TransactionBlock> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        const transferAmount = toBigNumber(balance, SUI_NATIVE_BASE);
        const existingBalance = BigNumber(
            await this.getUserSuiBalance(this.walletAddress || caller.toSuiAddress())
        );

        if (existingBalance.lte(transferAmount)) {
            throw new Error("owner has not enough sui tokens to transfer");
        }

        // First, split the gas coin into multiple coins using gas coin:
        const coin = tx.splitCoins(tx.gas, [tx.pure.u64(transferAmount.toFixed(0))]);
        tx.transferObjects([coin], tx.pure.address(to));

        return tx;
    }

    async transferCoinObjects(
        to: string,
        balance: number,
        coinObject: {
            balance: string;
            coinObjectIds: string[];
            coinType: string;
            decimals: number;
        },
        signer?: Signer | any,
        dryRun = false
    ) {
        const caller = signer || this.signer;
        if (coinObject.coinObjectIds.length < 1) return;

        const tx = new TransactionBlock();

        const primaryCoinInput = coinObject.coinObjectIds[0];

        let coin: TransactionResult;

        if (coinObject.coinType.endsWith("::sui::SUI")) {
            coin = tx.splitCoins(tx.gas, [
                tx.pure.u64(toBigNumber(balance, SUI_NATIVE_BASE).toFixed(0))
            ]);
        } else {
            if (coinObject.coinObjectIds.length > 1)
                tx.mergeCoins(primaryCoinInput, coinObject.coinObjectIds.slice(1));

            coin = tx.splitCoins(primaryCoinInput, [
                tx.pure.u64(toBigNumberStr(balance, coinObject.decimals))
            ]);
        }

        tx.transferObjects([coin], tx.pure.address(to));

        return dryRun
            ? this.dryRun(tx, signer)
            : this.executeTransactionBlock(caller, tx);
    }

    /**
     * Transfers Sui Balance to given wallet address
     * @param args.to destination wallet address
     * @param args.balance sui balance in normal base to transfer to destination wallet address
     * @param signer the signer object of the wallet that owns sui to transfer
     * @returns transaction Result
     */
    async transferSuiBalance(
        args: { to: string; balance: number },
        signer?: Signer | any
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;
        const tx = await this.prepareTransactionForSUITransfer(args.to, args.balance);
        return this.executeTransactionBlock(caller, tx);
    }

    public async getUSDCBalance(
        args?: {
            address?: string;
            currencyID?: string;
            limit?: number;
            cursor?: string;
        },
        signer?: Signer
    ): Promise<number> {
        const caller = signer || this.signer;
        const coins = await this.getUSDCCoins(args, caller);
        if (coins.data.length == 0) {
            return 0;
        } else {
            const bal = coins.data.reduce(
                (total: number, coin: any) => total + +coin.balance,
                0
            );
            return usdcToBaseNumber(bal);
        }
    }

    public async getUSDCoinHavingBalance(
        args: {
            amount: BigNumberable;
            address?: string;
            currencyID?: string;
            limit?: number;
            cursor?: string;
        },
        signer?: Signer
    ) {
        // get all usdc coins
        const coins = await this.getUSDCCoins(args, signer);

        for (const coin of coins.data) {
            if (
                bigNumber(coin.balance).gte(toBigNumber(args.amount, USDC_BASE_DECIMALS))
            ) {
                return coin;
            }
        }
        return undefined;
    }

    private executeZkTransaction = async ({
        tx,
        caller
    }: {
        tx: TransactionBlock;
        caller: Signer;
    }) => {
        tx.setSender(this.walletAddress);
        const { bytes, signature: userSignature } = await tx.sign({
            client: this.suiClient,
            signer: caller as Keypair
        });
        const zkSignature = createZkSignature({
            userSignature,
            zkPayload: this.getZkPayload()
        });
        return this.suiClient.executeTransactionBlock({
            transactionBlock: bytes,
            signature: zkSignature,
            options: {
                showObjectChanges: true,
                showEffects: true,
                showEvents: true,
                showInput: true
            }
        });
    };

    private executeWalletTransaction = async ({
        caller,
        tx
    }: {
        caller: any;
        tx: TransactionBlock;
    }): Promise<SuiTransactionBlockResponse> => {
        const { transactionBlockBytes, signature } = await (
            caller as unknown as ExtendedWalletContextState
        ).signTransactionBlock({
            transactionBlock: tx
        });

        return await this.suiClient.executeTransactionBlock({
            transactionBlock: transactionBlockBytes,
            signature: signature,
            options: {
                showObjectChanges: true,
                showEffects: true,
                showEvents: true,
                showInput: true
            }
        });
    };

    public async signAndCall(
        signer: Signer | any,
        method: string,
        callArgs: any[],
        moduleName: string,
        gasBudget?: number,
        packageId?: string,
        typeArguments?: string[]
    ): Promise<SuiTransactionBlockResponse> {
        const caller = signer || this.signer;

        const tx = new TransactionBlock();

        if (gasBudget) tx.setGasBudget(gasBudget);

        const params = callArgs.map(v => tx.pure(v));

        packageId = packageId || this.getPackageID();

        tx.moveCall({
            target: `${packageId}::${moduleName}::${method}`,
            arguments: callArgs,
            typeArguments: typeArguments || []
        });

        return this.executeTransactionBlock(caller, tx);
    }

    public async buildTxBlock(
        method: string,
        moduleName: string,
        callArgs: any[],
        signer: Signer | any,
        packageId?: string,
        typeArguments?: string[]
    ): Promise<TransactionBlock> {
        const tx = new TransactionBlock();

        tx.setSender(signer || this.signer);

        const params = callArgs.map(v => tx.pure(v));

        packageId = packageId || this.getPackageID();

        tx.moveCall({
            target: `${packageId}::${moduleName}::${method}`,
            arguments: params,
            typeArguments: typeArguments || []
        });

        return tx;
    }

    // ===================================== //
    //          SETTER METHODS
    // ===================================== //

    setSettlementCap(id: string) {
        this.settlementCap = id;
    }

    // ===================================== //
    //          GETTER METHODS
    // ===================================== //

    /**
     * Get Sui Balance of given wallet address
     * @param user wallet address to get the sui balance of
     * @returns sui balance of user in base 9
     */

    async getUserSuiBalance(user?: string): Promise<string> {
        const address = user || this.walletAddress || this.signer.toSuiAddress();
        const suiCoin = await this.suiClient.getBalance({
            owner: address
        });
        return suiCoin?.totalBalance;
    }

    async getOnChainObject(id: string): Promise<SuiObjectResponse> {
        return this.suiClient.getObject({
            id,
            options: {
                showOwner: true,
                showContent: true,
                showType: true
            }
        });
    }

    async getOwnedObjects(objType: string, ownerAddr?: string): Promise<string[]> {
        const owner = ownerAddr || this.signer.toSuiAddress();
        const ownedObjIds: string[] = [];
        // get all owned object by the user, along with its type
        const objects = await this.suiClient.getOwnedObjects({
            owner,
            options: { showType: true }
        });

        for (const obj of objects.data) {
            // if the type matches, push the id of object
            if ((obj.data?.type as any).indexOf(objType) >= 0) {
                ownedObjIds.push(obj.data?.objectId as any as string);
            }
        }

        return ownedObjIds;
    }

    async getUserPosition(perpetual: string, user?: string): Promise<UserPosition> {
        const positionTable = this.getPositionsTableID(perpetual);
        const userPos = await this.suiClient.getDynamicFieldObject({
            parentId: positionTable,
            name: {
                type: "address",
                value: user || this.signer.toSuiAddress()
            }
        });

        if (userPos.error?.code == "dynamicFieldNotFound") {
            throw new Error("Given user has never opened on-chain position");
        }

        // eslint-disable-next-line
        return (userPos?.data?.content as any).fields.value.fields;
    }

    async getUserPositionFromID(id: string): Promise<UserPosition> {
        const details = await this.getOnChainObject(id);
        return (details?.data?.content as any).fields.value.fields;
    }

    async getPerpDetails(id: string): Promise<any> {
        const details = await this.getOnChainObject(id);
        return (details?.data?.content as any).fields;
    }

    public async getBankAccountDetailsUsingID(
        id: string
    ): Promise<BankAccountDetails | undefined> {
        const obj = await this.getOnChainObject(id);
        if (obj) {
            if ((obj.data?.type as string).indexOf("BankAccount") > 0) {
                return this._parseAccountDetails(obj);
            } else {
                return undefined;
            }
        } else {
            throw `No object found with id: ${id}`;
        }
    }

    public async getUserBankBalance(user?: string, bankID?: string): Promise<BigNumber> {
        try {
            const userBalance = await this.suiClient.getDynamicFieldObject({
                parentId: bankID || this.getBankTableID(),
                name: {
                    type: "address",
                    value: user || this.signer.toSuiAddress()
                }
            });

            return new BigNumber(
                (userBalance.data as any).content.fields.value.fields.balance
            );
        } catch (e) {
            console.log(e);
            return new BigNumber(0);
        }
    }

    async executeTransactionBlock(
        caller: Signer,
        tx: TransactionBlock
    ): Promise<SuiTransactionBlockResponse> {
        if (this.is_zkLogin) {
            return this.executeZkTransaction({ caller, tx });
        } else if (this.is_wallet_extension) {
            return this.executeWalletTransaction({ caller, tx });
        } else {
            return this.executeTxBlock(tx, caller);
        }
    }

    private async prepareTransactionBlock(
        transactionBlock: Uint8Array | TransactionBlock | string
    ) {
        if (isTransaction(transactionBlock)) {
            transactionBlock.setSenderIfNotSet(this.walletAddress);
            return await transactionBlock.build({
                client: this.suiClient
            });
        }

        if (typeof transactionBlock === "string") {
            return fromB64(transactionBlock);
        }

        if (transactionBlock instanceof Uint8Array) {
            return transactionBlock;
        }
        throw new Error("Unknown transaction format");
    }

    async estimateGasFee(txb: TransactionBlock): Promise<bigint> {
        const result = await this.suiClient.dryRunTransactionBlock({
            transactionBlock: await this.prepareTransactionBlock(txb)
        });

        return (
            BigInt(result.effects.gasUsed.computationCost) +
            BigInt(result.effects.gasUsed.storageCost) -
            BigInt(result.effects.gasUsed.storageRebate)
        );
    }

    async estimateGasForSuiTransfer(args: { to: string; balance: number }) {
        const tx = await this.prepareTransactionForSUITransfer(args.to, args.balance);
        return await this.estimateGasFee(tx);
    }

    async prepareTransactionForUSDCTransfer(to: string, balance: number) {
        const tx = new TransactionBlock();

        //checking if user has sufficient balance to proceed

        const existingBalance = await this.getUSDCBalance();

        if (existingBalance <= balance) {
            throw new Error("owner has not enough sui tokens to transfer");
        }

        const usdcCoins = await this.getUSDCCoins();

        if (usdcCoins.data.length === 0) {
            throw new Error("coins not found");
        }

        const coinObject = await this.getUSDCoinHavingBalance({ amount: balance });

        let primaryCoinInput: string;

        if (coinObject) {
            primaryCoinInput = coinObject.coinObjectId;
        } else {
            //merge coins
            primaryCoinInput = usdcCoins.data[0].coinObjectId;
            tx.mergeCoins(
                primaryCoinInput,
                usdcCoins.data.slice(1).map(coin => tx.object(coin.coinObjectId))
            );
        }

        const coin = tx.splitCoins(primaryCoinInput, [
            tx.pure.u64(toBigNumberStr(balance, USDC_BASE_DECIMALS))
        ]);

        tx.transferObjects([coin], tx.pure.address(to));

        return tx;
    }

    async transferUSDC(args: { to: string; balance: number }, signer?: Signer | any) {
        const caller = signer || this.signer;
        const tx = await this.prepareTransactionForUSDCTransfer(args.to, args.balance);
        return this.executeTransactionBlock(caller, tx);
    }

    /**
     * Transfers Sui Balance to given wallet address
     * @param args.to destination wallet address
     * @param args.balance sui balance in normal base to transfer to destination wallet address
     * @param signer the signer object of the wallet that owns sui to transfer
     * @param coin which coin to transfer
     * @returns transaction Result
     */

    async transferCoins(
        args: {
            to: string;
            balance: number;
            coin: TRANSFERABLE_COINS;
        },
        signer?: Signer | any
    ): Promise<SuiTransactionBlockResponse> {
        const { to, balance } = args;
        switch (args.coin) {
            case TRANSFERABLE_COINS.SUI:
                return await this.transferSuiBalance({ to, balance }, signer);
            case TRANSFERABLE_COINS.USDC:
                return await this.transferUSDC({ to, balance }, signer);
            default:
                throw new Error("invalid coin");
        }
    }

    async estimateGasForUSDCTransfer(args: { to: string; balance: number }) {
        const tx = await this.prepareTransactionForUSDCTransfer(args.to, args.balance);
        return await this.estimateGasFee(tx);
    }

    getPriceOracleObjectId(market = "ETH-PERP"): string {
        return this.deployment["markets"][market]["Objects"]["PriceOracle"]["id"];
    }

    getPriceOracleFeedId(market = "ETH-PERP"): string {
        return this.deployment["markets"][market]["Config"]["priceInfoFeedId"];
    }

    getPythPkgId(market = "ETH-PERP"): string {
        return this.deployment["markets"][market]["Objects"]["PriceOracle"][
            "dataType"
        ].split("::")[0];
    }

    getSettlementOperators(): Operator[] {
        return this.deployment["objects"]["settlementOperators"] || [];
    }

    getBankID(): string {
        return this.deployment["objects"]["Bank"].id;
    }

    getUpgradeCapID(): string {
        return this.deployment["objects"]["UpgradeCap"].id;
    }

    getSafeID(): string {
        return this.deployment["objects"]["CapabilitiesSafe"].id as string;
    }

    getGuardianCap(): string {
        return this.deployment["objects"]["ExchangeGuardianCap"].id as string;
    }

    getFROperatorCapID(): string {
        return this.deployment["objects"]["FundingRateCap"].id as string;
    }

    getDeleveragingCapID(): string {
        return this.deployment["objects"]["DeleveragingCap"].id as string;
    }

    getSettlementOperatorTable(): string {
        return this.deployment["objects"]["Table<address, bool>"].id as string;
    }

    getPackageID(): string {
        return this.deployment["objects"]["package"].id as string;
    }

    getExchangeAdminCap(): string {
        return this.deployment["objects"]["ExchangeAdminCap"].id as string;
    }

    getSubAccountsID(): string {
        return this.deployment["objects"]["SubAccounts"].id as string;
    }

    getPriceOracleOperatorCap(): string {
        return this.deployment["objects"]["PriceOracleOperatorCap"].id as string;
    }

    getPublicSettlementCap(): string {
        return this.deployment["objects"]["SettlementCap"].id as string;
    }

    // by default returns the perpetual id of 1st market
    getPerpetualID(market = "ETH-PERP"): string {
        return this.deployment["markets"][market]["Objects"]["Perpetual"].id as string;
    }

    getOrdersTableID(): string {
        return this.deployment["objects"]["OrderStatus"].id as string;
    }

    getPositionsTableID(market = "ETH-PERP"): string {
        return this.deployment["markets"][market]["Objects"]["PositionsTable"]
            .id as string;
    }

    getBankTableID(): string {
        return this.deployment["objects"]["BankTable"].id as string;
    }

    getDeployerAddress(): string {
        return this.deployment["deployer"] as string;
    }

    getCurrencyID(): string {
        return this.deployment["objects"]["Currency"].id as string;
    }

    getCoinType(): string {
        return this.deployment["objects"]["Currency"].dataType as string;
    }

    getBankType(): string {
        return this.deployment["objects"]["Bank"]["dataType"];
    }

    getCurrencyType(): string {
        return this.deployment["objects"]["Currency"]["dataType"] as string;
    }

    getTreasuryCapID(): string {
        return this.deployment["objects"]["TreasuryCap"].id as string;
    }

    getSequencer(): string {
        return this.deployment["objects"]["Sequencer"].id as string;
    }

    // ===================================== //
    //          HELPER METHODS
    // ===================================== //

    _parseAccountDetails(obj: any): BankAccountDetails {
        return {
            address: obj.data.content.fields.value.fields.owner,
            balance: bigNumber(obj.data.content.fields.value.fields.balance)
        } as BankAccountDetails;
    }

    getZkPayload = (): ZkPayload => {
        return {
            decodedJWT: this.decodedJWT,
            proof: this.proof,
            salt: this.salt,
            maxEpoch: this.maxEpoch
        };
    };
}
