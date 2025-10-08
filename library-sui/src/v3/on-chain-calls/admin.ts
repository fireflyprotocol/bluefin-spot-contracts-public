import { SUI_NATIVE_BASE, USDC_BASE_DECIMALS, bigNumber, toBigNumberStr } from "../../";
import { IPerpetualConfig } from "../interfaces";
import { IBluefinV3OptionalParams } from "../interfaces/IOnChainCalls";
import { OnChainCalls } from "./on-chain-calls";
import { BigNumberable, OnChainCallResponse, SuiAddress } from "../../types";
import { processTradingStartTime } from "../../helpers";
import { DEFAULT } from "../../defaults";
import { Address, NumStr, Operator } from "../types";

export class AdminCalls extends OnChainCalls {
    /**
     * Create and executes external bank creation transaction
     * @param supportedCoin supported coin address. should be of format 0xax....bs::coin::COIN
     * @param supportedCoinName Name of the supported coin
     * @param coinDecimals The number of decimals in supported coin
     * @param weight The discounted price percentage to be used for asset
     * @param price The initial/starting price of the asset
     * @param collateral True if the asset can be used to collateralize a position
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    async createAssetBank(
        supportedCoin: Address,
        supportedCoinName: string,
        supportedCoinDecimals: NumStr,
        weight: NumStr,
        price: NumStr,
        collateral: boolean,
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this.txBuilder.createAssetBank(
            supportedCoin,
            supportedCoinName,
            supportedCoinDecimals,
            weight,
            price,
            collateral,
            options
        );

        return this.execCall(txb, options);
    }

    /**
     * Create and executes data store creation transaction
     * @param sequencer address of the sequencer that will own the data store
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    async createInternalDataStore(
        sequencer?: string,
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this.txBuilder.createInternalDataStore(
            sequencer || this.walletAddress,
            options
        );
        return this.execCall(txb, options);
    }

    /**
     * Allows the holder of the Treasury cap to mint test usdc coins (Will only work on Dev/Test net)
     * @param args optional {amountE6: defaults to 10K, should be in 6 decimal places, to: defaults to the signer}
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    async mintUSDC(
        args?: {
            amountE6?: NumStr;
            to?: string;
        },
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this.txBuilder.mintUSDC(
            args?.amountE6 || toBigNumberStr(10000, USDC_BASE_DECIMALS),
            args?.to || this.walletAddress
        );

        return this.execCall(txb, options);
    }

    /**
     * Create and executes perpetual creation transaction
     * @param perpetualConfig perpetual configs
     * @param options Optional tx execution params
     * @returns OnChainCallResponse and IPerpetualConfig
     */
    async createPerpetual(
        perpetualConfig: IPerpetualConfig,
        options?: IBluefinV3OptionalParams
    ): Promise<{
        txResponse: OnChainCallResponse;
        perpetualConfig: IPerpetualConfig;
    }> {
        perpetualConfig = {
            baseAssetSymbol: perpetualConfig.baseAssetSymbol || "ETH",
            baseAssetName: perpetualConfig.baseAssetName || "Ethereum",
            baseAssetDecimals: perpetualConfig.baseAssetDecimals || "600000",
            defaultLeverage: perpetualConfig.defaultLeverage || "3000000000",
            symbol: perpetualConfig.symbol || "ETH-PERP",
            imr: perpetualConfig.imr || toBigNumberStr(0.1, SUI_NATIVE_BASE),
            mmr: perpetualConfig.mmr || toBigNumberStr(0.05, SUI_NATIVE_BASE),
            stepSize: perpetualConfig.stepSize || toBigNumberStr(0.1, SUI_NATIVE_BASE),
            tickSize: perpetualConfig.tickSize || toBigNumberStr(0.001, SUI_NATIVE_BASE),
            minTradeQty:
                perpetualConfig.minTradeQty || toBigNumberStr(0.1, SUI_NATIVE_BASE),
            maxTradeQty:
                perpetualConfig.maxTradeQty || toBigNumberStr(1000, SUI_NATIVE_BASE),
            minTradePrice:
                perpetualConfig.minTradePrice || toBigNumberStr(0.1, SUI_NATIVE_BASE),
            maxTradePrice:
                perpetualConfig.maxTradePrice || toBigNumberStr(100000, SUI_NATIVE_BASE),
            maxNotionalAtOpen: perpetualConfig.maxNotionalAtOpen || [
                toBigNumberStr(1_000_000, SUI_NATIVE_BASE), //1x
                toBigNumberStr(1_000_000, SUI_NATIVE_BASE), //2x
                toBigNumberStr(500_000, SUI_NATIVE_BASE), //3x
                toBigNumberStr(500_000, SUI_NATIVE_BASE), //4x
                toBigNumberStr(250_000, SUI_NATIVE_BASE), //5x
                toBigNumberStr(250_000, SUI_NATIVE_BASE), //6x
                toBigNumberStr(250_000, SUI_NATIVE_BASE), //7x
                toBigNumberStr(250_000, SUI_NATIVE_BASE), //8x
                toBigNumberStr(100_000, SUI_NATIVE_BASE), //9x
                toBigNumberStr(100_000, SUI_NATIVE_BASE) //10x
            ],
            mtbLong: perpetualConfig.mtbLong || toBigNumberStr(0.2, SUI_NATIVE_BASE),
            mtbShort: perpetualConfig.mtbShort || toBigNumberStr(0.2, SUI_NATIVE_BASE),
            makerFee: perpetualConfig.makerFee || toBigNumberStr(0.001, SUI_NATIVE_BASE),
            takerFee: perpetualConfig.takerFee || toBigNumberStr(0.0045, SUI_NATIVE_BASE),
            maxFundingRate:
                perpetualConfig.maxFundingRate || toBigNumberStr(0.001, SUI_NATIVE_BASE),
            insurancePoolRatio:
                perpetualConfig.insurancePoolRatio ||
                toBigNumberStr(0.3, SUI_NATIVE_BASE),
            tradingStartTime: processTradingStartTime(
                perpetualConfig.tradingStartTime || 0,
                this.network == "mainnet" ? "PROD" : "DEV"
            ),
            insurancePool:
                perpetualConfig.insurancePool || DEFAULT.INSURANCE_POOL_ADDRESS,
            feePool: perpetualConfig.feePool || DEFAULT.FEE_POOL_ADDRESS,
            tradingStatus: true,
            delist: false,
            delistingPrice: 0,
            isolatedOnly: perpetualConfig.isolatedOnly || false,
            maxLimitOrderQuantity:
                perpetualConfig.maxLimitOrderQuantity ||
                toBigNumberStr(10000, SUI_NATIVE_BASE),
            maxMarketOrderQuantity:
                perpetualConfig.maxMarketOrderQuantity ||
                toBigNumberStr(1000, SUI_NATIVE_BASE)
        };

        const txb = this.txBuilder.createPerpetual(
            perpetualConfig.symbol,
            perpetualConfig.imr,
            perpetualConfig.mmr,
            perpetualConfig.stepSize,
            perpetualConfig.tickSize,
            perpetualConfig.minTradeQty,
            perpetualConfig.maxTradeQty,
            perpetualConfig.minTradePrice,
            perpetualConfig.maxTradePrice,
            perpetualConfig.maxNotionalAtOpen,
            perpetualConfig.mtbLong,
            perpetualConfig.mtbShort,
            perpetualConfig.makerFee,
            perpetualConfig.takerFee,
            perpetualConfig.maxFundingRate,
            perpetualConfig.insurancePoolRatio,
            perpetualConfig.tradingStartTime,
            perpetualConfig.insurancePool,
            perpetualConfig.feePool,
            perpetualConfig.isolatedOnly,
            perpetualConfig.baseAssetSymbol,
            perpetualConfig.baseAssetName,
            perpetualConfig.baseAssetDecimals,
            perpetualConfig.maxLimitOrderQuantity,
            perpetualConfig.maxMarketOrderQuantity,
            perpetualConfig.defaultLeverage,
            options
        );

        return { txResponse: await this.execCall(txb, options), perpetualConfig };
    }

    /**
     * Create and executes transaction to update perpetual tick size
     * @param perpAddress The address/id of the perpetual
     * @param tickSize the new tick size. Must be in 9 decimal places
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    async updateTickSize(
        perpAddress: string,
        tickSize: BigNumberable,
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this.txBuilder.updateTickSize(
            perpAddress,
            bigNumber(tickSize).toString(),
            options
        );

        return this.execCall(txb, options);
    }

    /**
     * Create and executes transaction to set an operator on EDS
     * @param type The type of the operator be updated
     * @param newOperator The address of the new operator to be set
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    async setOperatorEDS(
        type: Operator,
        newOperator: SuiAddress,
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this.txBuilder.setOperatorEDS(type, newOperator, options);

        return this.execCall(txb, options);
    }
}
