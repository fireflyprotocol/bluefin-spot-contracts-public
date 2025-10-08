import { bcs } from "@mysten/sui/bcs";
import { TransactionObjectArgument } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { CoinUtils, SuiBlocks, Transaction } from "../classes";
import { ZkPayload } from "../interfaces";
import { bigNumber } from "../library";
import {
    BigNumber,
    BigNumberable,
    BN,
    DryRunTransactionBlockResponse,
    Keypair,
    OnChainCallResponse,
    SignatureWithBytes,
    Signer,
    SuiClient,
    SuiTransactionBlockResponse,
    TransactionBlock
} from "../types";
import { createZkSignature } from "../utils";
import { Address, ID, NumStr } from "../v3/types";
import { CoinAmounts, d, LiquidityInput, TickMath } from "./clmm";
import { SwapUtils } from "./clmm/swap";
import {
    IAddRewardParams,
    IBluefinSpotContracts,
    ICoinDetails,
    IFeeAndRewards,
    ILiquidityParams,
    IPoolRewardInfo,
    IRewardAmounts,
    IRewardCoinsInPool,
    ISwapResultEvent,
    IUserRewardClaimedEvent
} from "./interfaces";
import {
    IOnChainCallOptionalParams,
    ISignerConfig,
    ISwapParams,
    ISwapRoute
} from "./interfaces/IOnchainCalls";
import { Pool } from "./types";
import {
    asUintN,
    getEstimatedAmountIncludingSlippage,
    getPercentageAmount,
    priceToSqrtPriceX64,
    sqrtPriceX64ToPrice
} from "./utils";
import { BLUE_COIN_TYPE } from "../constants";
import { QueryChain } from "./query-chain";

export class OnChainCalls {
    queryChain: QueryChain;
    suiClient: SuiClient;
    config: IBluefinSpotContracts;
    signerConfig: ISignerConfig;
    constructor(
        _suiClient: SuiClient,
        _config: IBluefinSpotContracts,
        options?: {
            signer?: Signer;
            address?: Address;
            isUIWallet?: boolean;
            isZkLogin?: boolean;
            zkPayload?: ZkPayload;
        }
    ) {
        this.suiClient = _suiClient;
        this.config = _config;
        this.queryChain = new QueryChain(this.suiClient);
        this.signerConfig = {
            signer: options?.signer as Signer,
            address: options?.address || (options.signer?.toSuiAddress() as string),
            isUIWallet: options?.isUIWallet == true,
            isZkLogin: options?.isZkLogin == true,
            zkPayload: options?.zkPayload
        };
    }

    /**
     * Signs and executes the given transaction block
     * @param txb Sui transaction block
     * @returns Sui Transaction Block Response
     */
    async signAndExecuteTxb(txb: TransactionBlock): Promise<SuiTransactionBlockResponse> {
        const signedBlock = await SuiBlocks.buildAndSignTxBlock(
            txb,
            this.suiClient,
            this.signerConfig.signer,
            this.signerConfig.isUIWallet
        );
        return SuiBlocks.executeSignedTxBlock(signedBlock, this.suiClient);
    }

    /**
     * Signs the given transaction
     * @param txb Sui transaction block
     * @returns Sui Transaction Block Response
     */
    async signTransaction(txb: TransactionBlock): Promise<SignatureWithBytes> {
        return SuiBlocks.signTxBlock(
            txb,
            this.signerConfig.signer,
            this.signerConfig.isUIWallet
        );
    }

    /**
     * Signs and executes the given transaction block
     * @param txb Sui transaction block
     * @returns Sui Transaction Block Response
     */
    async dryRunTxb(txb: TransactionBlock): Promise<DryRunTransactionBlockResponse> {
        const builtBlock = (await SuiBlocks.buildTxBlock(
            txb,
            this.suiClient,
            this.signerConfig.address,
            false
        )) as Uint8Array;

        return this.suiClient.dryRunTransactionBlock({
            transactionBlock: builtBlock
        });
    }

    /**
     * Handles call execution
     * @param txb The transaction block
     * @param options IOnChainCallOptionalParams
     * @returns OnChainCallResponse
     */
    async handleReturn(
        txb: TransactionBlock,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        if (options?.returnTx) return txb;

        if (this.signerConfig.isZkLogin) {
            return options?.dryRun == true
                ? await this.dryRunTxb(txb)
                : this.executeZkTransaction({
                      caller: this.signerConfig.signer,
                      tx: txb
                  });
        } else {
            return options?.dryRun == true
                ? await this.dryRunTxb(txb)
                : options?.sign
                ? this.signTransaction(txb)
                : await this.signAndExecuteTxb(txb);
        }
    }

    private executeZkTransaction = async ({
        tx,
        caller
    }: {
        tx: TransactionBlock;
        caller: Signer;
    }) => {
        tx.setSender(this.signerConfig.address);
        const { bytes, signature: userSignature } = await tx.sign({
            client: this.suiClient,
            signer: caller as Keypair
        });
        const zkSignature = createZkSignature({
            userSignature,
            zkPayload: this.signerConfig.zkPayload
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

    /**
     * Allows admin to set pool creation fee
     * @param coinType The fee coin type
     * @param amount The amount of fee to be paid
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async setPoolCreationFee(
        coinType: string,
        amount: BigNumberable,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.config.AdminCap),
                txb.object(this.config.GlobalConfig),
                txb.pure.u64(bigNumber(amount).toFixed(0))
            ],
            target: `${this.config.CurrentPackage}::admin::set_pool_creation_fee`,
            typeArguments: [coinType]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to create a pool for provided coins
     * @param coinA the type of coin A
     * @param coinB the type of coin B
     * @param poolName the name of pool
     * @param tickSpacing tick spacing
     * @param feeBps The fee rate of the pool in bps
     * @param price the starting price of the pool
     * @param feeCoinType The coin type to be used for payment of pool creation
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async createPool(
        coinA: ICoinDetails,
        coinB: ICoinDetails,
        poolName: string,
        tickSpacing: number,
        feeBps: NumStr,
        price: BigNumberable,
        feeCoinType: string,
        options?: IOnChainCallOptionalParams & { iconURl?: string }
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        const { supported, amount } = await this.getPoolCreationFeeInfoForCoin(
            feeCoinType
        );

        if (!supported)
            throw `Provided Fee coin type: ${feeCoinType} is not supported for payment of pool creation`;

        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            amount,
            feeCoinType,
            this.signerConfig.address
        );

        const sqrtPriceX64 = TickMath.priceToSqrtPriceX64(
            d(bigNumber(price).toString()),
            coinA.decimals,
            coinB.decimals
        );

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.pure.string(poolName),
                txb.pure.string(options?.iconURl || ""),
                txb.pure.string(coinA.symbol!),
                txb.pure.u8(coinA.decimals!),
                txb.pure.string(coinA.url || ""),
                txb.pure.string(coinB.symbol!),
                txb.pure.u8(coinB.decimals!),
                txb.pure.string(coinB.url || ""),
                txb.pure.u32(tickSpacing),
                txb.pure.u64(bigNumber(feeBps).multipliedBy(100).toFixed(0)),
                txb.pure.u128(sqrtPriceX64.toString()),
                txb.object(splitCoin)
            ],
            target: `${this.config.CurrentPackage}::gateway::create_pool_v2`,
            typeArguments: [coinA.type, coinB.type, feeCoinType]
        });

        // transfer any lingering merge coin back to sender
        if (mergeCoin) {
            txb.transferObjects(
                [mergeCoin as TransactionObjectArgument],
                this.signerConfig.address
            );
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to open a position for the provided pool for given ticks
     * @param pool Name or the pool or the pool for which to open the position
     * @param lowerTick signed lower tick number
     * @param upperTick signed upper tick number
     * @param options IOnChainCallOptionalParams & { owner: optional address of the position's owner }
     */
    async openPosition(
        pool: Pool,
        lowerTick: number,
        upperTick: number,
        options?: IOnChainCallOptionalParams & { owner?: string }
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        const owner = options?.owner || this.signerConfig.address;

        const { position, txb } = this._openPositionInternal(pool, lowerTick, upperTick, {
            txb: txBlock
        });

        txb.transferObjects([position], owner);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to provide liquidity to the pool
     * @param pool Name or the pool itself to which liquidity is to be provided
     * @param position The ID fo the position for which liquidity is being provided
     * @param liquidity The amount of liquidity to provide
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async provideLiquidity(
        pool: Pool,
        position: ID,
        params: ILiquidityParams,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = await this._provideLiquidityInternal(pool, position, params, options);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to provide liquidty to the pool by fixed amount of coins
     * @param pool Name or the pool itself to which liquidity is to be provided
     * @param position The ID fo the position for which liquidity is being provided
     * @param amount The amount of coins to be provided
     * @param isFixedA True if the amount being provided is coin A
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async provideLiquidityWithFixedAmount(
        pool: Pool,
        position: ID,
        liquidityInput: LiquidityInput,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = await this._provideLiquidityFixedAmountInternal(
            pool,
            position,
            liquidityInput,
            options
        );

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to remove liquidity from the pool for provided position
     * @param pool Name or the pool itself from which liquidity will be removed
     * @param position The ID of the position for which liquidity is being removed from
     * @param params: LiquidityInput
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async removeLiquidity(
        pool: Pool,
        position: ID,
        params: LiquidityInput,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = await this._removeLiquidityInternal(pool, position, params, options);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to open a position and provide liquidity to the pool in a single Tx
     * @param pool Name or the pool or the pool for which to open the position
     * @param params Liquidity params
     * @param options: IOnChainCallOptionalParams
     */
    async openPositionWithLiquidity(
        pool: Pool,
        params: ILiquidityParams,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        const result = this._openPositionInternal(
            pool,
            params.lowerTick,
            params.upperTick,
            { ...options, txb }
        );

        txb = result.txb;
        const position = result.position;

        txb = await this._provideLiquidityInternal(pool, position, params, {
            ...options,
            txb
        });

        txb.transferObjects([position], this.signerConfig.address);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to open a position and provide liquidity to the pool by fixed amount
     * @param pool Name or the pool or the pool for which to open the position
     * @param lowerTick The lower tick unsigned bits
     * @param upperTick The upper tick unsigned bits
     * @param liquidity The amount of liquidity to be provided
     * @param options: IOnChainCallOptionalParams
     */
    async openPositionWithFixedAmount(
        pool: Pool,
        lowerTick: number,
        upperTick: number,
        params: LiquidityInput,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        const result = this._openPositionInternal(pool, lowerTick, upperTick, {
            ...options,
            txb
        });

        txb = result.txb;
        const position = result.position;

        txb = await this._provideLiquidityFixedAmountInternal(pool, position, params, {
            ...options,
            txb
        });

        txb.transferObjects([position], this.signerConfig.address);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to fully close the provided position. Any residual liquidity is withdrawn
     * @param pool The pool for which the position is providing liquidity
     * @param position The ID fo the position to be closed
     * @param options IOnChainCallOptionalParams & { transferCoinsTo: optional address to which removed liquidity will be sent to }
     * Returns OnChainCallResponse
     */
    async closePosition(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams & { transferCoinsTo?: Address }
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        const transferCoinsTo = options?.transferCoinsTo || this.signerConfig.address;

        txb = await this._collectRewardInternal(pool, position, {
            txb: txb
        });

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.object(position),
                txb.pure.address(transferCoinsTo)
            ],
            target: `${this.config.CurrentPackage}::gateway::close_position`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows pool manager or rewards manager to initialize rewards in pool
     * @param pool The pool in which rewards are to be initialized
     * @param startTime start time in seconds for the rewards (must be in future).
     * @param activeForSeconds seconds for which the rewards are to remain active.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param rewardAmount reward coin amount which is to be assigned (caller must have coins of specified reward type)
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async addRewardCoinInPool(
        params: IAddRewardParams,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            params.rewardAmount.toString(),
            params.rewardCoinType,
            this.signerConfig.address
        );

        txb.moveCall({
            arguments: [
                txb.object(this.config.GlobalConfig),
                txb.object(params.pool.id),
                txb.pure.u64(params.startTime),
                txb.pure.u64(params.activeForSeconds),
                txb.object(splitCoin),
                txb.pure.string(params.rewardCoinSymbol),
                txb.pure.u8(params.rewardCoinDecimals),
                txb.pure.u64(params.rewardAmount.toString()),
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
            target: `${this.config.CurrentPackage}::admin::initialize_pool_reward`,
            typeArguments: [
                params.pool.coin_a.address,
                params.pool.coin_b.address,
                params.rewardCoinType
            ]
        });

        // transfer any lingering merge coin back to sender
        if (mergeCoin) {
            txb.transferObjects(
                [mergeCoin as TransactionObjectArgument],
                this.signerConfig.address
            );
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows admin of the protocol to add rewards manager in pool
     * @param address address of the reward manager
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async addRewardsManager(
        address: string,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(this.config.AdminCap),
                txb.object(this.config.GlobalConfig),
                txb.pure.address(address)
            ],
            target: `${this.config.CurrentPackage}::admin::add_reward_manager`
        });
        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows admin of the to pause/unpause a pool
     * @param pool The pool for which to update pause status
     * @param pause True/False the new status of the pool
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async updatePoolStatus(
        pool: Pool,
        pause: boolean,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(this.config.AdminCap),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.pure.bool(pause)
            ],
            target: `${this.config.CurrentPackage}::admin::update_pool_pause_status`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });
        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows current pool manager to set a new pool manager
     * @param pool the pool for which to set the manger
     * @param address address of the new manager
     * @param options IOnChainCallOptionalParams
     */
    async setPoolManager(
        pool: Pool,
        address: string,
        options?: IOnChainCallOptionalParams & { owner?: string }
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.pure.address(address)
            ],
            target: `${this.config.CurrentPackage}::pool::set_manager`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * fetches pool manager of a given pool
     * @param pool the pool for which to set the manger
     * @param options IOnChainCallOptionalParams
     */
    async getPoolManager(
        pool: Pool,
        options?: IOnChainCallOptionalParams & { owner?: string }
    ): Promise<string> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [txb.object(pool.id)],
            target: `${this.config.CurrentPackage}::pool::get_pool_manager`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });

        return bcs.Address.parse(Uint8Array.from(result.results[0].returnValues[0][0]));
    }

    /**
     * fetches information of rewards given in a pool
     * @param pool the pool for which rewards are to be fetched
     * @param options IOnChainCallOptionalParams
     * Returns  IRewardCoinsInPool[]
     */
    async getRewardCoinsInPool(pool: Pool): Promise<IRewardCoinsInPool[]> {
        const poolObject = await this.suiClient.getObject({
            id: pool.id,
            options: { showContent: true }
        });

        const fields = (poolObject.data?.content as any).fields;
        const rewardInfos = fields.reward_infos.map(
            reward_infos => reward_infos.fields
        ) as IPoolRewardInfo[];

        const availableRewardCoinsInPool: IRewardCoinsInPool[] = [];

        for (const rewardInfo of rewardInfos) {
            // Temporary fix: Do not include rewards with type of blue coin
            // this is to cater the pools which have been assigned blue coin which we can not give to users.
            if (rewardInfo.reward_coin_type != BLUE_COIN_TYPE) {
                const rewardCoin = {
                    coinType: rewardInfo.reward_coin_type,
                    coinSymbol: rewardInfo.reward_coin_symbol,
                    coinDecimals: rewardInfo.reward_coin_decimals
                };
                availableRewardCoinsInPool.push(rewardCoin);
            }
        }

        return availableRewardCoinsInPool;
    }

    /**
     * Allows pool manager or rewards manager to update reward emissions of initialized rewards in pool
     * @param pool The pool in which rewards are initialized
     * @param activeForSeconds seconds for which the rewards are to remain active.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param rewardAmount reward coin amount which is to be assigned (caller must have coins of specified reward type)
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async updateRewardCoinEmission(
        pool: Pool,
        activeForSeconds: number,
        rewardCoinType: string,
        rewardAmount: BigNumber,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            rewardAmount.toString(),
            rewardCoinType,
            this.signerConfig.address
        );

        txb.moveCall({
            arguments: [
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.pure.u64(activeForSeconds),
                txb.object(splitCoin),
                txb.pure.u64(rewardAmount.toString()),
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
            target: `${this.config.CurrentPackage}::admin::update_pool_reward_emission`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address, rewardCoinType]
        });

        // transfer any lingering merge coin back to sender
        if (mergeCoin) {
            txb.transferObjects(
                [mergeCoin as TransactionObjectArgument],
                this.signerConfig.address
            );
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows pool manager or rewards manager to add seconds to the reward emissions of initialized rewards in pool
     * @param pool The pool in which rewards are intialized
     * @param secondsToAdd seconds to increase in reward emission.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async addSecondsToRewardCoinEmission(
        pool: Pool,
        secondsToAdd: number,
        rewardCoinType: string,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.pure.u64(secondsToAdd),
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
            target: `${this.config.CurrentPackage}::admin::add_seconds_to_reward_emission`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address, rewardCoinType]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows the current admin of the protocol to increase
     * the supported protocol version
     */
    async updateSupportedVersion(
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.config.AdminCap),
                txb.object(this.config.GlobalConfig)
            ],
            target: `${this.config.CurrentPackage}::admin::update_supported_version`
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Fetches the rewards accrued by the user
     * by dev inspecting `collect_reward` method with provided params
     * @param pool The pool for which the position is providing liquidity
     * @param position id of the position against which rewards are accrued.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param options IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
     * Returns IRewardAmounts[]
     */
    async getAccruedRewards(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
    ): Promise<IRewardAmounts[]> {
        const txb = options?.txb || new TransactionBlock();

        let rewardCoinsType = options?.rewardCoinsType;
        // if reward coin types are not explicitly supplied then find reward coins in Pool
        if (!rewardCoinsType || rewardCoinsType?.length == 0) {
            const rewardCoinsInPool = await this.getRewardCoinsInPool(pool);
            rewardCoinsType = rewardCoinsInPool.map(rewardCoin => rewardCoin.coinType);
        }

        for (const rewardCoinType of rewardCoinsType) {
            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(this.config.GlobalConfig),
                    txb.object(pool.id),
                    txb.object(position)
                ],
                target: `${this.config.CurrentPackage}::pool::collect_reward`,

                typeArguments: [pool.coin_a.address, pool.coin_b.address, rewardCoinType]
            });
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        const tx = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });

        const rewards = Transaction.getEvents(
            tx as any,
            "UserRewardCollected"
        ) as IUserRewardClaimedEvent[];

        return rewards.map(reward => {
            return {
                coinAmount: reward.reward_amount,
                coinSymbol: reward.reward_symbol,
                coinType: reward.reward_type,
                coinDecimals: reward.reward_decimals
            } as IRewardAmounts;
        });
    }

    /**
     * Fetches the fee and rewards accrued by the user in a given position
     * by dev inspecting `collect_reward` and `get_accrued_fee` method with provided params
     * @param pool The pool for which the position is providing liquidity
     * @param position id of the position against which rewards and fees are accrued.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param options IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
     * Returns IFeeAndRewards
     */
    async getAccruedFeeAndRewards(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams
    ): Promise<IFeeAndRewards> {
        const txb = options?.txb || new TransactionBlock();

        const rewardCoins = await this.getRewardCoinsInPool(pool);

        // get accrued rewards from contracts
        for (const rewardCoin of rewardCoins) {
            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(pool.id),
                    txb.object(position)
                ],
                target: `${this.config.CurrentPackage}::pool::get_accrued_rewards`,
                typeArguments: [
                    pool.coin_a.address,
                    pool.coin_b.address,
                    rewardCoin.coinType
                ]
            });
        }
        // get accrued fee from contracts
        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(pool.id),
                txb.object(position)
            ],
            target: `${this.config.CurrentPackage}::pool::get_accrued_fee`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });

        // Combine Fee and Rewards data
        // result.results[] array will contain n rewards entries at start and 1 fee entry in last
        const data = {
            rewards: rewardCoins.map((reward, index) => {
                return {
                    coinAmount: new BN(
                        bcs
                            .u64()
                            .parse(
                                Uint8Array.from(result.results[index].returnValues[0][0])
                            )
                    ).toString(),
                    coinSymbol: reward.coinSymbol,
                    coinType: reward.coinType,
                    coinDecimals: reward.coinDecimals
                } as IRewardAmounts;
            }),
            fee: {
                coinA: new BN(
                    bcs
                        .u64()
                        .parse(
                            Uint8Array.from(
                                result.results[rewardCoins.length].returnValues[0][0]
                            )
                        )
                ),
                coinB: new BN(
                    bcs
                        .u64()
                        .parse(
                            Uint8Array.from(
                                result.results[rewardCoins.length].returnValues[1][0]
                            )
                        )
                )
            }
        };
        return data;
    }

    /**
     * Allows user to collect accrued rewards.
     * @param pool The pool for which the position is providing liquidity
     * @param position id of the position against which rewards are accrued.
     * @param options IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
     * Returns OnChainCallResponse
     */
    async collectRewards(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        txb = await this._collectRewardInternal(pool, position, {
            txb: txb,
            rewardCoinsType: options.rewardCoinsType
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows user to collect accrued fees and rewards from the provided position
     * @param pool The pool for which the position is providing liquidity
     * @param position id of the position against which fees and rewards are accrued.
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async collectFeeAndRewards(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        txb = this._collectFeeInternal(pool, position, { txb: txb });

        txb = await this._collectRewardInternal(pool, position, {
            txb: txb
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows user to collect accrued rewards from all the provided positions
     * @param userAddress The address of the user
     * @param positionData positions data required for claiming rewards
     * @param options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async collectRewardsForAllPositions(
        userAddress: string,
        positionsData?: {
            pool: Pool;
            positionId: ID;
        }[],
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        let txb = options?.txb || new TransactionBlock();

        // If the positionsData is not provided , query data from chain
        if (!positionsData || positionsData.length == 0) {
            positionsData = [];
            const positions = await this.queryChain.getUserPositions(
                this.config.BasePackage,
                userAddress
            );
            for (const position of positions) {
                const pool = await this.queryChain.getPool(position.pool_id);
                positionsData.push({ pool, positionId: position.position_id });
            }
        }

        // For each position , create claim rewards Txn
        for (const position of positionsData) {
            txb = await this._collectRewardInternal(position.pool, position.positionId, {
                txb: txb
            });

            txb = this._collectFeeInternal(position.pool, position.positionId, {
                txb: txb
            });
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to perform a swap on the pool
     * @param params The swap contract call parameters
     * @param  options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async swapAssets(
        params: ISwapParams,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        return this._swap(params, options);
    }

    /**
     * Dev inspects `calculate_swap_results` method with provided params
     * @param params The swap contract call parameters
     * @param  options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async computeSwapResults(
        params: ISwapParams,
        options?: IOnChainCallOptionalParams
    ): Promise<any> {
        return this._computeSwapResults(params, options);
    }

    /**
     * Returns the estimated amount (input or output) the user will get for the swap
     * by dev inspecting `calculate_swap_results` method with provided params
     * @param params The swap contract call parameters
     * @param  options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    async getEstimatedAmount(
        params: ISwapParams,
        options?: IOnChainCallOptionalParams
    ): Promise<number> {
        const result = await this._computeSwapResults(
            { ...params, estimateAmount: true },
            options
        );
        const event = Transaction.getEvents(result, "SwapResult")[0] as ISwapResultEvent;
        return Number(event.amount_calculated);
    }

    /**
     * Allows the admin of the bluefin spot protocol to change the protocol fee share of a pool
     * @param pool The pool for which protocol fee share is being updated
     * @param protocolFeeShare the new protocol fee share, must be in 1e6 format. 100% is represented as 1e6
     * @param options
     */
    async updateProtocolFeeShare(
        pool: Pool,
        protocolFeeShare: BigNumberable,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.config.AdminCap),
                txb.object(pool.id),
                txb.pure.u64(bigNumber(protocolFeeShare).toFixed(0))
            ],
            target: `${this.config.CurrentPackage}::admin::update_protocol_fee_share`,

            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to execute the swap route to convert Asset A -> B -> C
     */
    async executeSwapRoute(
        route: ISwapRoute,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();
        const recepient = route?.recepient || this.signerConfig.address;

        let edgeNo = 0;
        let middleStep = false;
        const totalEdges = route.path.length;

        let coin = CoinUtils.zeroCoin(txb, route.fromCoin);

        while (edgeNo < totalEdges) {
            const edge = route.path[edgeNo];

            const pool = edge.pool;

            // if on the last step of the swap route, set middle step to false
            if (edgeNo >= 1) {
                middleStep = true;
            }

            const { coinA, coinB } = edge.a2b
                ? { coinA: coin, coinB: CoinUtils.zeroCoin(txb, pool.coin_b.address) }
                : { coinA: CoinUtils.zeroCoin(txb, pool.coin_a.address), coinB: coin };

            // if last edge, use the slippage provided by user else 95%
            const slippage = bigNumber(edgeNo < totalEdges ? 95 : route.slippage);

            const { amountIn, amountOut } = edge.byAmountIn
                ? {
                      amountIn: bigNumber(edge.amountIn),
                      amountOut: bigNumber(edge.amountOut)
                  }
                : {
                      amountIn: bigNumber(edge.amountOut),
                      amountOut: bigNumber(edge.amountIn)
                  };

            const amountLimit = getEstimatedAmountIncludingSlippage(
                amountOut,
                slippage,
                true
            );

            const sqrtPriceX64Limit = SwapUtils.getDefaultSqrtPriceLimit(edge.a2b);

            const coinAB: TransactionObjectArgument[] = txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(this.config.GlobalConfig),
                    txb.object(pool.id),
                    txb.object(coinA),
                    txb.object(coinB),
                    txb.pure.bool(edge.a2b),
                    txb.pure.bool(edge.byAmountIn),
                    txb.pure.bool(middleStep),
                    txb.pure.u64(amountIn.toFixed(0)),
                    txb.pure.u64(amountLimit.toFixed(0)),
                    txb.pure.u128(sqrtPriceX64Limit.toString())
                ],
                target: `${this.config.CurrentPackage}::gateway::route_swap`,
                typeArguments: [pool.coin_a.address, pool.coin_b.address]
            });

            // if the last edge of path was executed, transfer coins to the recepient
            if (edgeNo + 1 == totalEdges) {
                txb.transferObjects([coinAB[0]], txb.pure.address(recepient));
                txb.transferObjects([coinAB[1]], txb.pure.address(recepient));
            } else {
                // we are still not at the last edge, store the output coin from the Tx
                coin = edge.a2b ? coinAB[1] : coinAB[0];

                // transfer the other object to recepient
                txb.transferObjects(
                    [edge.a2b ? coinAB[0] : coinAB[1]],
                    txb.pure.address(recepient)
                );
            }

            // move on to next edge
            edgeNo++;
        }

        return this.handleReturn(txb, options);
    }

    /**
     * Allows caller to claim accrued fee from the provided position
     * @param pool The name of the pool or the pool itself
     * @param position The position id from which to collect fee
     * @param options IOnChainCallOptionalParams
     */
    async collectFee(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = this._collectFeeInternal(pool, position, options);

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * Returns the fee accrued by provided position
     * @param pool The complete state of the pool
     * @param position The id of the position for which to get accrued fee
     * @returns CoinAmounts: The fee accrued for coin A and B
     */
    async getAccruedFee(pool: Pool, position: ID): Promise<CoinAmounts> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(pool.id),
                txb.object(position)
            ],
            target: `${this.config.CurrentPackage}::pool::get_accrued_fee`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });
        return {
            coinA: new BN(
                bcs.u64().parse(Uint8Array.from(result.results[0].returnValues[0][0]))
            ),
            coinB: new BN(
                bcs.u64().parse(Uint8Array.from(result.results[0].returnValues[1][0]))
            )
        };
    }

    /**
     * Returns the fee accrued by provided position
     * @param pool The complete state of the pool
     * @param position The id of the position for which to get accrued fee
     * @returns CoinAmounts: The fee accrued for coin A and B
     */
    async getAccruedFeeForPositions(
        args: Array<{ pool: Pool; position: ID }>
    ): Promise<Array<CoinAmounts>> {
        const txb = new TransactionBlock();

        args.forEach(v => {
            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(v.pool.id),
                    txb.object(v.position)
                ],
                target: `${this.config.CurrentPackage}::pool::get_accrued_fee`,
                typeArguments: [v.pool.coin_a.address, v.pool.coin_b.address]
            });
        });

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });

        return result.results.map(res => {
            return {
                coinA: new BN(bcs.u64().parse(Uint8Array.from(res.returnValues[0][0]))),
                coinB: new BN(bcs.u64().parse(Uint8Array.from(res.returnValues[1][0])))
            };
        });
    }

    /**
     * Returns true/false if the provided coin type is supported for pool creation along with the fee amount
     */
    async getPoolCreationFeeInfoForCoin(
        coinType: string
    ): Promise<{ supported: boolean; amount: number }> {
        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [txb.object(this.config.GlobalConfig)],
            target: `${this.config.CurrentPackage}::config::get_pool_creation_fee_amount`,
            typeArguments: [coinType]
        });

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });

        return {
            supported: bcs
                .bool()
                .parse(Uint8Array.from(result.results[0].returnValues[0][0])),
            amount: Number(
                bcs.u64().parse(Uint8Array.from(result.results[0].returnValues[1][0]))
            )
        };
    }

    /**
     * @param params The swap contract call parameters
     * @param  options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    private async _swap(
        params: ISwapParams,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txb = options?.txb || new TransactionBlock();

        const toAmount = params.byAmountIn
            ? bigNumber(params.amountOut)
            : bigNumber(params.amountIn);

        const amountLimit = getEstimatedAmountIncludingSlippage(
            toAmount,
            bigNumber(params.slippage),
            params.byAmountIn
        );

        const price = sqrtPriceX64ToPrice(params.pool, params.pool.current_sqrt_price);

        // if apply slippage to price is true, then slippage is applied to price as well
        // else use an arbitrary large slippage value
        params.slippage = params.applySlippageToPrice ? params.slippage : 0.2;

        const sqrtPriceLimit = priceToSqrtPriceX64(
            params.pool,
            getPercentageAmount(price, params.slippage, !params.aToB).toFixed()
        );

        const coinAmount = params.byAmountIn
            ? bigNumber(params.amountIn).toFixed(0)
            : bigNumber(params.amountOut).toFixed(0);

        // if swap input is coinA then create required coinA or else make coinA as zero
        const [splitCoinA, mergeCoinA] = params.aToB
            ? await CoinUtils.createCoinWithBalance(
                  this.suiClient,
                  txb,
                  coinAmount,
                  params.pool.coin_a.address,
                  this.signerConfig.address
              )
            : [CoinUtils.zeroCoin(txb, params.pool.coin_a.address), undefined];

        // if swap input is coinB then create required coinB or else make coinB as zero
        const [splitCoinB, mergeCoinB] = !params.aToB
            ? await CoinUtils.createCoinWithBalance(
                  this.suiClient,
                  txb,
                  coinAmount,
                  params.pool.coin_b.address,
                  this.signerConfig.address
              )
            : [CoinUtils.zeroCoin(txb, params.pool.coin_b.address), undefined];

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(params.pool.id),
                txb.object(splitCoinA),
                txb.object(splitCoinB),
                txb.pure.bool(params.aToB),
                txb.pure.bool(params.byAmountIn),
                txb.pure.u64(
                    params.byAmountIn
                        ? bigNumber(params.amountIn).toFixed(0)
                        : bigNumber(params.amountOut).toFixed(0)
                ),
                txb.pure.u64(amountLimit.toFixed(0)),
                txb.pure.u128(sqrtPriceLimit.toString())
            ],
            target: `${this.config.CurrentPackage}::gateway::swap_assets`,
            typeArguments: [params.pool.coin_a.address, params.pool.coin_b.address]
        });

        // merge the remaining coins and send them all back to user
        const coins: TransactionObjectArgument[] = [];
        [mergeCoinA, mergeCoinB].forEach(item => {
            if (item) {
                coins.push(item);
            }
        });

        if (coins.length > 0) {
            txb.transferObjects(coins, this.signerConfig.address);
        }

        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return this.handleReturn(txb, options);
    }

    /**
     * @param pool The pool to which liquidity is to be provided
     * @param position ID or the position object for which liquidity is being provided
     * @param params Liquidity params
     * @param options IOnChainCallOptionalParams
     * Returns Transaction Block
     */
    private async _provideLiquidityInternal(
        pool: Pool,
        position: ID | TransactionObjectArgument,
        params: ILiquidityParams,
        options?: IOnChainCallOptionalParams
    ): Promise<TransactionBlock> {
        const txb = options?.txb || new TransactionBlock();

        const [splitCoinA, mergeCoinA] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            params.coinAmounts.coinA.toString(),
            pool.coin_a.address,
            this.signerConfig.address
        );

        const [splitCoinB, mergeCoinB] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            params.coinAmounts.coinB.toString(),
            pool.coin_b.address,
            this.signerConfig.address
        );

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.object(position),
                txb.object(splitCoinA),
                txb.object(splitCoinB),
                txb.pure.u64(params.minCoinAmounts.coinA.toString()),
                txb.pure.u64(params.minCoinAmounts.coinB.toString()),
                txb.pure.u128(params.liquidity)
            ],
            target: `${this.config.CurrentPackage}::gateway::provide_liquidity`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        // merge the remaining coins and send them all back to user
        const coins: TransactionObjectArgument[] = [];
        [mergeCoinA, mergeCoinB].forEach(item => {
            if (item) {
                coins.push(item);
            }
        });

        if (coins.length > 0) {
            txb.transferObjects(coins, this.signerConfig.address);
        }

        return txb;
    }

    /**
     * @param pool The pool to which liquidity is to be provided
     * @param position ID or the position object for which liquidity is being provided
     * @param liquidityInput LiquidityInput
     * @param options IOnChainCallOptionalParams
     * Returns Transaction Block
     */
    private async _provideLiquidityFixedAmountInternal(
        pool: Pool,
        position: ID | TransactionObjectArgument,
        liquidityInput: LiquidityInput,
        options?: IOnChainCallOptionalParams
    ): Promise<TransactionBlock> {
        const txb = options?.txb || new TransactionBlock();

        // Use the input amount of the fixed token rather than max amount
        // else you may run into issues like user might not have more fixed tokens
        // in their wallet for instance when a user provides the max coin A or max coin B
        // liquidity.
        const [amountAMax, amountBMax] = liquidityInput.fix_amount_a
            ? [liquidityInput.coinAmount, liquidityInput.tokenMaxB]
            : [liquidityInput.tokenMaxA, liquidityInput.coinAmount];

        const amount = liquidityInput.coinAmount;

        const [splitCoinA, mergeCoinA] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            amountAMax.toString(),
            pool.coin_a.address,
            this.signerConfig.address
        );

        const [splitCoinB, mergeCoinB] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            amountBMax.toString(),
            pool.coin_b.address,
            this.signerConfig.address
        );

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.object(position),
                txb.object(splitCoinA),
                txb.object(splitCoinB),
                txb.pure.u64(amount.toString()),
                txb.pure.u64(amountAMax.toString()),
                txb.pure.u64(amountBMax.toString()),
                txb.pure.bool(liquidityInput.fix_amount_a)
            ],
            target: `${this.config.CurrentPackage}::gateway::provide_liquidity_with_fixed_amount`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        // merge the remaining coins and send them all back to user
        const coins: TransactionObjectArgument[] = [];
        [mergeCoinA, mergeCoinB].forEach(item => {
            if (item) {
                coins.push(item);
            }
        });

        if (coins.length > 0) {
            txb.transferObjects(coins, this.signerConfig.address);
        }

        return txb;
    }

    /**
     * Allows caller to remove liquidity from the pool for provided position
     * @param pool Name or the pool itself from which liquidity will be removed
     * @param position The ID fo the position for which liquidity is being removed from
     * @param position: liquidity Input params
     * @param options IOnChainCallOptionalParams & { transferCoinsTo: optional address to which removed liquidity will be sent to }
     * Returns Transaction Block
     */
    private async _removeLiquidityInternal(
        pool: Pool,
        position: ID,
        params: LiquidityInput,
        options?: IOnChainCallOptionalParams & { transferCoinsTo?: Address }
    ): Promise<TransactionBlock> {
        let txb = options?.txb || new TransactionBlock();

        const transferCoinsTo = options?.transferCoinsTo || this.signerConfig.address;

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.object(position),
                txb.pure.u128(params.liquidityAmount.toString()),
                txb.pure.u64(params.tokenMaxA.toString()),
                txb.pure.u64(params.tokenMaxB.toString()),
                txb.pure.address(transferCoinsTo)
            ],
            target: `${this.config.CurrentPackage}::gateway::remove_liquidity`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        // sending collect reward transaction as well within same tx block
        txb = this._collectFeeInternal(pool, position, { txb: txb });

        // sending collect reward transaction as well within same tx block
        txb = await this._collectRewardInternal(pool, position, {
            txb: txb
        });

        return txb;
    }

    /**
     * Internal method that Allows user to collect accrued rewards from the provided position
     * @param pool The pool for which the position is providing liquidity
     * @param position id of the position against which rewards are accrued.
     * @param rewardCoinType reward coin type (eg. 0x81650ac0868edf55349fa41d4323db5b8a4827bab3b672c16c14c7135abcc3df::usdc::USDC)
     * @param options IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
     * Returns TransactionBlock
     */
    private async _collectRewardInternal(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams & { rewardCoinsType?: string[] }
    ): Promise<TransactionBlock> {
        const txb = options?.txb || new TransactionBlock();

        let rewardCoinsType = options?.rewardCoinsType;

        // if reward coins types are not explicitly supplied then find reward coins in Pool from chain
        if (!rewardCoinsType || rewardCoinsType?.length == 0) {
            const rewardCoinsInPool = await this.getRewardCoinsInPool(pool);
            rewardCoinsType = rewardCoinsInPool.map(rewardCoin => rewardCoin.coinType);
        }

        const claimableRewardTypes: string[] = [];

        // check for which reward types , a position has non zero rewards (zero rewards are not claimable on chain)
        for (const rewardCoinType of rewardCoinsType) {
            const tempTx = new TransactionBlock();
            tempTx.moveCall({
                arguments: [
                    tempTx.object(SUI_CLOCK_OBJECT_ID),
                    tempTx.object(pool.id),
                    tempTx.object(position)
                ],
                target: `${this.config.CurrentPackage}::pool::get_accrued_rewards`,
                typeArguments: [pool.coin_a.address, pool.coin_b.address, rewardCoinType]
            });

            const inspectResult = await this.suiClient.devInspectTransactionBlock({
                transactionBlock: tempTx,
                sender: this.signerConfig.address
            });
            const rewards = new BN(
                bcs
                    .u64()
                    .parse(Uint8Array.from(inspectResult.results[0].returnValues[0][0]))
            );
            if (!rewards.isZero()) claimableRewardTypes.push(rewardCoinType);
        }

        // only include claim call for claimable rewards
        for (const rewardCoinType of claimableRewardTypes) {
            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(this.config.GlobalConfig),
                    txb.object(pool.id),
                    txb.object(position)
                ],
                target: `${this.config.CurrentPackage}::gateway::collect_reward`,

                typeArguments: [pool.coin_a.address, pool.coin_b.address, rewardCoinType]
            });
        }
        if (options?.gasBudget) txb.setGasBudget(options.gasBudget);

        if (options?.sender) txb.setSenderIfNotSet(options.sender);

        return txb;
    }

    /**
     * Internal method that allows caller to claim accrued fee from the provided position
     * @param pool The name of the pool or the pool itself
     * @param position The position id from which to collect fee
     * @param options IOnChainCallOptionalParams
     * Returns TransactionBlock
     */
    private _collectFeeInternal(
        pool: Pool,
        position: ID,
        options?: IOnChainCallOptionalParams
    ): TransactionBlock {
        const txb = options?.txb || new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.object(position)
            ],
            target: `${this.config.CurrentPackage}::gateway::collect_fee`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        return txb;
    }

    /**
     * Allows caller to open a position for the provided pool for given ticks
     * @param pool Name or the pool or the pool for which to open the position
     * @param lowerTick The lower tick (signed)
     * @param upperTick The upper tick (signed)
     */
    private _openPositionInternal(
        pool: Pool,
        lowerTick: number,
        upperTick: number,
        options?: IOnChainCallOptionalParams
    ): { txb: TransactionBlock; position: TransactionObjectArgument } {
        const txb = options?.txb || new TransactionBlock();

        const tickLowerBits = Number(asUintN(BigInt(lowerTick)).toString());
        const tickUpperBits = Number(asUintN(BigInt(upperTick)).toString());

        const [position] = txb.moveCall({
            arguments: [
                txb.object(this.config.GlobalConfig),
                txb.object(pool.id),
                txb.pure.u32(tickLowerBits),
                txb.pure.u32(tickUpperBits)
            ],
            target: `${this.config.CurrentPackage}::pool::open_position`,
            typeArguments: [pool.coin_a.address, pool.coin_b.address]
        });

        return { txb, position };
    }

    /**
     * @param params The swap contract call parameters
     * @param  options IOnChainCallOptionalParams
     * Returns OnChainCallResponse
     */
    private async _computeSwapResults(
        params: ISwapParams,
        options?: IOnChainCallOptionalParams
    ): Promise<any> {
        const txb = options?.txb || new TransactionBlock();

        const price = sqrtPriceX64ToPrice(params.pool, params.pool.current_sqrt_price);

        // if apply slippage to price is true, then slippage is applied to price as well
        // else use an arbitrary large slippage value
        params.slippage = params.applySlippageToPrice ? params.slippage : 0.2;

        // when estimating output amount use the max possible price limit
        const sqrtPriceLimit = params.estimateAmount
            ? SwapUtils.getDefaultSqrtPriceLimit(params.aToB)
            : priceToSqrtPriceX64(
                  params.pool,
                  getPercentageAmount(price, params.slippage, !params.aToB).toFixed()
              );

        txb.moveCall({
            arguments: [
                txb.object(params.pool.id),
                txb.pure.bool(params.aToB),
                txb.pure.bool(params.byAmountIn),
                txb.pure.u64(
                    params.byAmountIn
                        ? bigNumber(params.amountIn).toFixed(0)
                        : bigNumber(params.amountOut).toFixed(0)
                ),
                txb.pure.u128(sqrtPriceLimit.toString())
            ],
            target: `${this.config.CurrentPackage}::pool::calculate_swap_results`,

            typeArguments: [params.pool.coin_a.address, params.pool.coin_b.address]
        });

        return this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signerConfig.address
        });
    }

    /// Returns true if the provided coin type is Blue Points
    isBluePointsReward(coinType): boolean {
        return coinType.split("::")[2] == "BPOINT";
    }
}
