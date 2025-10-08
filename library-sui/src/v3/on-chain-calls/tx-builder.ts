import { DeploymentParser } from "../utils";
import { ITxBuilderOptionalParams, IDeployment, IWithdrawal } from "../interfaces";
import { Address, NumStr, Operator, Serialized, SupportedAssets } from "../types";
import { BigNumberable, SuiAddress, TransactionBlock } from "../../types";
import { bigNumber, hexStrToUint8 } from "../../library";
import { BCSUtils, Withdrawal } from "../utils/bcs";

export class TxBuilder {
    parser: DeploymentParser;

    constructor(_deployment: IDeployment) {
        this.parser = new DeploymentParser(_deployment);
    }

    /**
     * Create external bank creation transaction
     * @param supportedCoin supported coin address. should be of format 0xax....bs::coin::COIN
     * @param supportedCoinName Name of the supported coin
     * @param coinDecimals The number of decimals in supported coin
     * @param weight The discounted price percentage to be used for asset
     * @param collateral True if the asset can be used to collateralize a position
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    createAssetBank(
        supportedCoin: string,
        supportedCoinName: string,
        coinDecimals: NumStr,
        weight: NumStr,
        price: NumStr,
        collateral: boolean,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getAdminCap()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.string(supportedCoinName),
                txb.pure.u8(Number(coinDecimals)),
                txb.pure.u64(weight),
                txb.pure.u64(price),
                txb.pure.bool(collateral)
            ],
            typeArguments: [supportedCoin],
            target: `${this.parser.getPackageId()}::data_store::create_asset_bank`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Create data store creation transaction
     * @param sequencer address of the sequencer that will own the data store
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    createInternalDataStore(
        sequencer: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getAdminCap()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.address(sequencer)
            ],
            target: `${this.parser.getPackageId()}::data_store::create_internal_data_store`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Create internal data store transfer call
     * @param sequencer address of the new sequencer that will own ids
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    transferInternalDataStore(
        sequencer: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.address(sequencer)
            ],
            target: `${this.parser.getPackageId()}::data_store::transfer_ids`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Builds USDC mint coin transaction
     * @param amount the amount to be minted
     * @param to the receiver of the amount
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    mintUSDC(
        amount: NumStr,
        to: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getTreasuryCap()),
                txb.pure.u64(amount),
                txb.pure.address(to)
            ],
            target: `${this.parser.getPackageId()}::coin::mint`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Builds transaction to deposit usdc to external bank
     * @param assetSymbol name of the asset to be deposited
     * @param destination the receiver of the deposited coins on the bank
     * @param amount the amount to be minted
     * @param coinID the id of the usdc coin to be deposited
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    depositToAssetBank(
        assetSymbol: SupportedAssets,
        destination: string,
        amount: BigNumberable,
        coinID: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getExternalDataStore()),
                txb.object(this.parser.getAssetBank(assetSymbol)),
                txb.pure.address(destination),
                txb.pure.u64(bigNumber(amount).toFixed(0)),
                txb.object(coinID)
            ],
            typeArguments: [this.parser.getCurrency(assetSymbol)],
            target: `${this.parser.getPackageId()}::exchange::deposit_to_margin_bank`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Builds transaction to deposit usdc to internal bank
     * @param assetSymbol Name of the asset to be deposited
     * @param from The address of the account that deposited assets in shared Asset Bank
     * @param nonce the nonce emitted during asset deposit in shared bank
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    depositToInternalBank(
        assetSymbol: SupportedAssets,
        from: Address,
        nonce: NumStr,
        sequenceHash: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.object(this.parser.getExternalDataStore()),
                txb.object(this.parser.getAssetBank(assetSymbol)),
                txb.pure.address(from),
                txb.pure.u64(nonce),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash)))
            ],
            typeArguments: [this.parser.getCurrency(assetSymbol)],
            target: `${this.parser.getPackageId()}::exchange::deposit_to_internal_bank`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates perpetual creation transaction
     * @param PerpetualCreationParams take a look at IPerpetualConfig
     * @param options Optional tx building params
     * @returns TransactionBlock
     */
    createPerpetual(
        symbol: string,
        imr: NumStr,
        mmr: NumStr,
        stepSize: NumStr,
        tickSize: NumStr,
        minTradeQuantity: NumStr,
        maxTradeQuantity: NumStr,
        minTradePrice: NumStr,
        maxTradePrice: NumStr,
        maxNotionalAtOpen: NumStr[],
        mtbLong: NumStr,
        mtbShort: NumStr,
        makerFee: NumStr,
        takerFee: NumStr,
        maxFundingRate: NumStr,
        insurancePoolRatio: NumStr,
        tradingStartTime: NumStr,
        insurancePool: string,
        feePool: string,
        isolatedOnly: boolean,
        baseAssetSymbol: string,
        baseAssetName: string,
        baseAssetDecimals: NumStr,
        maxLimitOrderQuantity: NumStr,
        maxMarketOrderQuantity: NumStr,
        defaultLeverage: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getAdminCap()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.string(symbol),
                txb.pure.u64(imr),
                txb.pure.u64(mmr),
                txb.pure.u64(stepSize),
                txb.pure.u64(tickSize),
                txb.pure.u64(minTradeQuantity),
                txb.pure.u64(maxTradeQuantity),
                txb.pure.u64(minTradePrice),
                txb.pure.u64(maxTradePrice),
                txb.pure.vector("u64", maxNotionalAtOpen),
                txb.pure.u64(mtbLong),
                txb.pure.u64(mtbShort),
                txb.pure.u64(makerFee),
                txb.pure.u64(takerFee),
                txb.pure.u64(maxFundingRate),
                txb.pure.u64(insurancePoolRatio),
                txb.pure.u64(tradingStartTime),
                txb.pure.address(insurancePool),
                txb.pure.address(feePool),
                txb.pure.bool(isolatedOnly),
                txb.pure.string(baseAssetSymbol),
                txb.pure.string(baseAssetName),
                txb.pure.u64(baseAssetDecimals),
                txb.pure.u64(maxLimitOrderQuantity),
                txb.pure.u64(maxMarketOrderQuantity),
                txb.pure.u64(defaultLeverage)
            ],
            target: `${this.parser.getPackageId()}::data_store::create_perpetual`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Create transaction to update perpetual tick size
     * @param perpetual the address of the perpetual
     * @param tickSize the new tick size. Must be in base decimals i.e No extra zeros
     * @param options Optional tx building params
     * @returns OnChainCallResponse
     */
    updateTickSize(
        perpetual: string,
        tickSize: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getAdminCap()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.address(perpetual),
                txb.pure.u64(tickSize)
            ],
            target: `${this.parser.getPackageId()}::data_store::update_tick_size`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction to synchronize the attributes of provided perpetual between ids and eds
     * @param perpetual the address of the perpetual to be synced
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param options Optional tx building params
     * @returns Transaction Block
     */
    syncPerpetual(
        perpetual: string,
        sequenceHash: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.address(perpetual),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash)))
            ],
            target: `${this.parser.getPackageId()}::data_store::sync_perpetual`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction to synchronize the supported asset among data stores
     * @param symbol the symbol of the asset
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param options Optional tx building params
     * @returns Transaction Block
     */
    syncSupportedAsset(
        symbol: string,
        sequenceHash: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.string(symbol),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash)))
            ],
            target: `${this.parser.getPackageId()}::data_store::sync_supported_asset`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction for withdraw call on-chain to move funds for a user
     * from the bank to user address
     * @param data serialized hex string of the withdrawal payload
     * @param signature bcs serialized signature payload generated by the user by signing the withdrawal request
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param options Optional tx execution params
     * @returns TransactionBlock
     */
    withdrawFromBank(
        data: Serialized,
        signature: Serialized,
        perpetuals: Array<string>,
        oraclePrices: Array<string>,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        const rawData = BCSUtils.deserializeData(data, Withdrawal) as IWithdrawal;

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.object(this.parser.getExternalDataStore()),
                txb.object(this.parser.getAssetBank(rawData.assetSymbol)),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("address", perpetuals),
                txb.pure.vector("u128", oraclePrices),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            typeArguments: [this.parser.getCurrency(rawData.assetSymbol)],
            target: `${this.parser.getPackageId()}::exchange::withdraw_from_bank`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction for user authorization call on-chain to authorize/un-authorized given user
     * @param data serialized hex string of the authorization payload
     * @param signature bcs serialized signature generate by singing the request payload data
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp The timestamp at which off-chain margining engine processed this request
     * @param options Optional tx execution params
     * @returns OnChainCallResponse
     */
    authorizeUser(
        data: Serialized,
        signature: Serialized,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::authorize_account`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates trade transaction block
     * @param makerOrder The signed maker order
     * @param takerOrder The signed taker order
     * @param quantity  The quantity to be trade
     * @param perpetuals The list of perpetual address for which oracle prices are to be updated
     * @param oraclePrice The list of oracle prices
     * @param sequenceHash Sequence hash
     * @param timestamp The timestamp at which trade was executed off-chain ( on margining engine )
     * @param options Optional tx execution params & execution time
     * @returns TransactionBlock
     */
    performTrade(
        makerOrder: Uint8Array,
        takerOrder: Uint8Array,
        makerSignature: string,
        takerSignature: string,
        quantity: NumStr,
        perpetuals: Array<string>,
        oraclePrices: Array<string>,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(makerOrder)),
                txb.pure.vector("u8", Array.from(takerOrder)),
                txb.pure.vector("u8", Array.from(hexStrToUint8(makerSignature))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(takerSignature))),
                txb.pure.u64(quantity),
                txb.pure.vector("address", perpetuals),
                txb.pure.vector("u64", oraclePrices),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::trade`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates liquidation transaction block
     * @param payload The liquidation payload that was signed by the liquidator
     * @param signature The liquidator's signature
     * @param perpetuals The list of perpetual address for which oracle prices are to be updated
     * @param oraclePrice The list of oracle prices
     * @param sequenceHash Sequence hash
     * @param timestamp The timestamp at which liquidation was executed off-chain ( on margining engine )
     * @param options Optional tx execution params & execution time
     * @returns TransactionBlock
     */
    performLiquidation(
        payload: Serialized,
        signature: Serialized,
        perpetuals: Array<string>,
        oraclePrices: Array<string>,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(payload))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("address", perpetuals),
                txb.pure.vector("u64", oraclePrices),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::liquidate`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates adjust margin transaction block
     * @param data serialized hex string of the adjust margin payload
     * @param signature bcs serialized signature payload generated by the user by signing the adjust margin request
     * @param perpetuals The list of perpetual address for which oracle prices are to be updated
     * @param oraclePrice The list of oracle prices
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp  The time at which margin got adjusted off-chain
     * @param options Optional tx execution params & execution time
     * @returns TransactionBlock
     */
    adjustMargin(
        data: Serialized,
        signature: Serialized,
        perpetuals: Array<string>,
        oraclePrices: Array<string>,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("address", perpetuals),
                txb.pure.vector("u64", oraclePrices),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::adjust_margin`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates adjust leverage transaction block
     * @param data serialized hex string of the adjust leverage payload
     * @param signature bcs serialized signature payload generated by the user by signing the adjust leverage request
     * @param perpetuals The list of perpetual address for which oracle prices are to be updated
     * @param oraclePrice The list of oracle prices
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp  The time at which leverage got adjusted off-chain
     * @param options Optional tx execution params
     * @returns TransactionBlock
     */
    adjustLeverage(
        data: Serialized,
        signature: Serialized,
        perpetuals: Array<string>,
        oraclePrices: Array<string>,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("address", perpetuals),
                txb.pure.vector("u64", oraclePrices),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::adjust_leverage`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates set operator on eds transaction block
     * @param type The type of the operator be updated
     * @param newOperator The address of the new operator to be set
     * @param options Optional tx execution params
     * @returns TransactionBlock
     */
    setOperatorEDS(
        type: Operator,
        newOperator: SuiAddress,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getAdminCap()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.string(type),
                txb.pure.address(newOperator)
            ],
            target: `${this.parser.getPackageId()}::data_store::set_operator`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction to synchronize the provided operator among data stores
     * @param type The operator key/type to be synced
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param options Optional tx building params
     * @returns Transaction Block
     */
    syncOperator(
        type: Operator,
        sequenceHash: string,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.object(this.parser.getExternalDataStore()),
                txb.pure.string(type),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash)))
            ],
            target: `${this.parser.getPackageId()}::data_store::sync_operator`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction for setting funding rate for markets/perpetuals on-chain
     * @param data serialized hex string of the set funding rate payload
     * @param signature bcs serialized signature payload generated by the user by signing the funding rate request
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp the timestamp at which funding rate was set off-chain
     * @param options Optional tx execution params
     * @returns TransactionBlock
     */
    setFundingRate(
        data: Serialized,
        signature: Serialized,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::set_funding_rate`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Creates transaction for applying funding rate to provided accounts on-chain
     * @param data serialized hex string of the apply funding rate payload
     * @param signature bcs serialized signature payload generated by the user by signing the apply funding rate request
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp  The time at which funding rate was applied off-chain
     * @param options Optional tx execution params
     * @returns TransactionBlock
     */
    applyFundingRate(
        data: Serialized,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::apply_funding_rate`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Create transaction to prune table
     * @param data serialized hex string of purging table
     * @param signature bcs serialized signature payload generated by the user by signing the prune table request
     * @param sequenceHash the expected sequence hash on-chain after the tx execution
     * @param timestamp The timestamp at which table got pruned off-chain
     * @param options?: ITxBuilderOptionalParams
     * @returns TransactionBlock
     */
    pruneTable(
        data: Serialized,
        signature: Serialized,
        sequenceHash: string,
        timestamp: NumStr,
        options?: ITxBuilderOptionalParams
    ): TransactionBlock {
        const txb = options?.txBlock || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.parser.getInternalDataStore()),
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(sequenceHash))),
                txb.pure.u64(timestamp)
            ],
            target: `${this.parser.getPackageId()}::exchange::prune_table`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }
}
