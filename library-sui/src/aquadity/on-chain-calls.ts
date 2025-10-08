import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { CoinUtils, SuiBlocks } from "../classes";
import { bigNumber } from "../library";
import {
    IBluefinSpotContracts,
    IOnChainCallOptionalParams,
    IPosition,
    ISignerConfig,
    QueryChain
} from "../spot";
import { asIntN } from "../spot/clmm";
import { OnChainCallResponse, Signer, SuiClient, TransactionBlock } from "../types";
import { Address, ID } from "../v3/types";
import {
    AuqadityContracts,
    ClosePositionArgs,
    CollectFeeArgs,
    CollectRewardArgs,
    CreateVaultArgs,
    FundVaultArgs,
    OpenPositionArgs,
    ProvideLiquidityArgs,
    RemoveLiquidityArgs,
    Reserves,
    UpdateUsersArgs,
    Vault,
    WithdrawFundArgs
} from "./types";

export class OnChainCalls {
    suiClient: SuiClient;
    contracts: AuqadityContracts;
    spotContracts: IBluefinSpotContracts;
    signerConfig: ISignerConfig;
    constructor(
        _suiClient: SuiClient,
        _contracts: AuqadityContracts,
        options?: {
            spotContracts?: IBluefinSpotContracts;
            signer?: Signer;
            address?: Address;
            isUIWallet?: boolean;
        }
    ) {
        this.suiClient = _suiClient;
        this.contracts = _contracts;
        this.spotContracts = options?.spotContracts;
        this.signerConfig = {
            signer: options?.signer as Signer,
            address: options?.address || (options.signer?.toSuiAddress() as string),
            isUIWallet: options?.isUIWallet == true
        };
    }

    /**
     * Returns the vaults of provided name
     * @param name Name of the vault(s) to look for
     * @returns Array of vaults
     */
    getVaultByName(name: string): Array<Vault> {
        return this.contracts.Vaults.filter(vault => vault.name == name);
    }

    /**
     * Fetches the state of vault from chain
     * @param id
     * @returns
     */
    async getVaultFromChain(id: ID): Promise<Vault> {
        const vault = await this.suiClient.getObject({
            id,
            options: { showContent: true }
        });
        const fields = (vault.data?.content as any).fields;
        delete fields.id;
        fields.id = id;
        return fields;
    }

    /**
     * Returns all positions opened using the funds of provided vault
     * @param vault The id of the vault
     * @returns array of positions
     */
    async getVaultPositions(vault: ID): Promise<Array<IPosition>> {
        const dynamicFieldObject = await this.suiClient.getDynamicFieldObject({
            parentId: vault,
            name: {
                type: "0x1::string::String",
                value: "positions"
            }
        });
        const vector = (dynamicFieldObject.data?.content as any).fields.value;

        return vector.map(v => {
            return {
                owner: vault,
                pool_id: v.fields.pool_id,
                position_id: v.fields.id.id,
                lower_tick: Number(
                    asIntN(BigInt(v.fields.lower_tick.fields.bits)).toString()
                ),
                upper_tick: Number(
                    asIntN(BigInt(v.fields.upper_tick.fields.bits)).toString()
                ),
                liquidity: Number(v.fields.liquidity),
                fee_growth_coin_a: Number(v.fields.fee_growth_coin_a),
                fee_growth_coin_b: Number(v.fields.fee_growth_coin_b),
                fee_rate: Number(v.fields.fee_rate),
                token_a_fee: Number(v.fields.token_a_fee),
                token_b_fee: Number(v.fields.token_b_fee)
            } as IPosition;
        });
    }

    /**
     * Returns the current available reserves of each token that vault holds
     * @param vault The id of the vault
     * @returns Array of coin reserves
     */
    async getVaultReserves(vault: ID): Promise<Array<Reserves>> {
        let cursor = undefined;
        let hasNextPage = true;
        let dynamicFields = [];

        while (hasNextPage) {
            const resp = await this.suiClient.getDynamicFields({
                parentId: vault
            });

            hasNextPage = resp.hasNextPage;
            cursor = resp.nextCursor;
            dynamicFields = dynamicFields.concat(resp.data);
        }

        const reserves = await Promise.all(
            dynamicFields
                .filter(df => df.name.value != "positions")
                .map(async df => {
                    const dynamicFieldObject = await this.suiClient.getDynamicFieldObject(
                        {
                            parentId: vault,
                            name: df.name
                        }
                    );

                    const fields = (dynamicFieldObject.data?.content as any).fields;

                    return {
                        id: fields.id.id,
                        coinType: fields.name,
                        value: Number(fields.value)
                    } as Reserves;
                })
        );

        return reserves;
    }

    /**
     * @notice Allows caller to create a vault. Any one is allowed to create a vault.
     * @param args CreateVaultArgs
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async createVault(
        args: CreateVaultArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(this.contracts.VaultStore),
                txBlock.pure.address(args.manager || this.signerConfig.address),
                txBlock.pure.string(args.name),
                txBlock.pure.u8(args.type || 1),
                txBlock.pure.vector("address", args.users || [])
            ],
            target: `${this.contracts.CurrentPackage}::vault::create_vault`
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * @notice Allows caller to deposit funds into the vault for its users to use
     * @param args FundVaultArgs
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async provideFunds(
        args: FundVaultArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        // create coin of provided balance
        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txBlock,
            args.amount,
            args.coinType,
            this.signerConfig.address
        );

        txBlock.moveCall({
            arguments: [
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(splitCoin)
            ],
            target: `${this.contracts.CurrentPackage}::vault::provide_funds`,
            typeArguments: [args.coinType]
        });

        if (mergeCoin) {
            txBlock.transferObjects([mergeCoin], this.signerConfig.address);
        }

        return this.setAndExecute(txBlock, options);
    }

    /**
     * @notice Allows vault manager to withdraw funds from the vault
     * @param args WithdrawFundArgs
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async withdrawFunds(
        args: WithdrawFundArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.pure.u64(bigNumber(args.amount).toFixed(0))
            ],
            target: `${this.contracts.CurrentPackage}::vault::withdraw_funds`,
            typeArguments: [args.coinType]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * @notice Allows vault manager to add/whitelist or remove/blacklist users from the vault
     * @param args UpdateUsersArgs
     * @param options: OnChain params call
     * Returns OnChainCallResponse
     */
    async updateUsers(
        args: UpdateUsersArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.pure.vector("address", args.users)
            ],
            target: `${this.contracts.CurrentPackage}::vault::${
                args.add ? "add_users" : "remove_users"
            }`
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to open a position for the provided pool for given ticks
     * using the specified vault funds
     * @param args OpenPositionArgs
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async openPosition(
        args: OpenPositionArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.u32(args.lowerTickBits),
                txBlock.pure.u32(args.upperTickBits)
            ],
            target: `${this.contracts.CurrentPackage}::spot::open_position`,
            typeArguments: [args.pool.coin_a.address, args.pool.coin_b.address]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to provide liquidity to a position opened using the vault on bluefin spot protocol
     * @param args Provide liquidity arguments
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async provideLiquidity(
        args: ProvideLiquidityArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.id(args.position),
                txBlock.pure.u64(bigNumber(args.amount).toFixed(0)),
                txBlock.pure.u64(bigNumber(args.coinAMax).toFixed(0)),
                txBlock.pure.u64(bigNumber(args.coinBMax).toFixed(0)),
                txBlock.pure.bool(args.isFixedA)
            ],
            target: `${this.contracts.CurrentPackage}::spot::provide_liquidity_with_fixed_amount`,
            typeArguments: [args.pool.coin_a.address, args.pool.coin_b.address]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to remove liquidity from a position opened using the vault on bluefin spot protocol
     * @param args Remove liquidity arguments
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async removeLiquidity(
        args: RemoveLiquidityArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.id(args.position),
                txBlock.pure.u128(bigNumber(args.liquidity).toFixed(0)),
                txBlock.pure.u64(bigNumber(args.coinAMin).toFixed(0)),
                txBlock.pure.u64(bigNumber(args.coinBMin).toFixed(0))
            ],
            target: `${this.contracts.CurrentPackage}::spot::remove_liquidity`,
            typeArguments: [args.pool.coin_a.address, args.pool.coin_b.address]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to collect any fee accrued in the position opened on bluefin spot pools using vault funds
     * @param args Collect Fee Arguments
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async collectFee(
        args: CollectFeeArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.id(args.position),
                txBlock.pure.address(args.destination)
            ],
            target: `${this.contracts.CurrentPackage}::spot::collect_fee`,
            typeArguments: [args.pool.coin_a.address, args.pool.coin_b.address]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to collect the rewards accrued of given coin type on a position opened on bluefin spot pools
     * @param args Collect Reward Arguments
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async collectReward(
        args: CollectRewardArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.id(args.position),
                txBlock.pure.address(args.destination)
            ],
            target: `${this.contracts.CurrentPackage}::spot::collect_reward`,
            typeArguments: [
                args.pool.coin_a.address,
                args.pool.coin_b.address,
                args.rewardCoinType
            ]
        });

        return this.setAndExecute(txBlock, options);
    }

    /**
     * Allows caller to close a position on bluefin spot protocol
     * @param args Close Position Arguments
     * @param options IOnChainCallOptionalParams
     * @returns Onchain call response
     */
    async closePosition(
        args: ClosePositionArgs,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        const txBlock = options?.txb || new TransactionBlock();

        txBlock.moveCall({
            arguments: [
                txBlock.object(SUI_CLOCK_OBJECT_ID),
                txBlock.object(this.contracts.ProtocolConfig),
                txBlock.object(args.vault),
                txBlock.object(this.spotContracts.GlobalConfig!),
                txBlock.object(args.pool.id),
                txBlock.pure.id(args.position),
                txBlock.pure.address(args.destination)
            ],
            target: `${this.contracts.CurrentPackage}::spot::close_position`,
            typeArguments: [args.pool.coin_a.address, args.pool.coin_b.address]
        });

        return this.setAndExecute(txBlock, options);
    }

    private async setAndExecute(
        txBlock: TransactionBlock,
        options?: IOnChainCallOptionalParams
    ): Promise<OnChainCallResponse> {
        if (options?.gasBudget) txBlock.setGasBudget(options.gasBudget);

        if (options?.sender) txBlock.setSenderIfNotSet(options.sender);

        return SuiBlocks.execCall(
            txBlock,
            this.suiClient,
            this.signerConfig.signer,
            options?.dryRun,
            this.signerConfig.isUIWallet
        );
    }
}
