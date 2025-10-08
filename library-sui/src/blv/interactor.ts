import {
    CoinStruct,
    PaginatedCoins,
    SuiClient,
    SuiTransactionBlockResponse,
    SuiTransactionBlockResponseOptions
} from "@mysten/sui/client";
import { Keypair, Signer } from "@mysten/sui/cryptography";
import {
    Transaction as TransactionBlock,
    TransactionObjectArgument
} from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import BigNumber from "bignumber.js";
import { DecodeJWT, ExtendedWalletContextState, ZkPayload } from "../interfaces";
import {
    bigNumber,
    hexStrToUint8,
    toBaseNumber,
    toBigNumber,
    toBigNumberStr
} from "../library";
import { BigNumberable, PartialZkLoginSignature } from "../types";
import { createZkSignature } from "../utils";
import { BLVDeploymentConfig, RewardPool, User } from "./interface";
import { TOKEN_DECIMALS, USDC_DECIMALS } from "./utils";
import { VaultType } from "./enums";
import { toB64 } from "@mysten/sui/utils";
import { SignaturePayloadStruct } from "./signer";
import { NumStr } from "../v3/types";
import { CoinUtils } from "../classes";

export class Interactor {
    suiClient: SuiClient;
    signer: Signer;
    deployment: BLVDeploymentConfig;
    isWalletExtension: boolean;
    isZKLogin: boolean;
    maxEpoch?: number;
    proof?: PartialZkLoginSignature;
    decodedJWT?: DecodeJWT;
    salt?: string;
    walletAddress?: string;
    poolIdToCoin: { [key: string]: string };

    constructor(
        _suiClient: SuiClient,
        _deployment: any,
        _signer?: Signer,
        isWalletExtension = false,
        _isZKLogin = false,
        zkPayload?: ZkPayload,
        _walletAddress?: string
    ) {
        this.suiClient = _suiClient;
        this.deployment = _deployment;
        // could be undefined, if initializing the interactor for only get calls
        this.signer = _signer as Signer;
        this.isWalletExtension = isWalletExtension;
        this.isZKLogin = _isZKLogin;
        if (_isZKLogin && zkPayload) {
            this.maxEpoch = zkPayload.maxEpoch;
            this.proof = zkPayload.proof;
            this.decodedJWT = zkPayload.decodedJWT;
            this.salt = zkPayload.salt;
        }
        this.walletAddress = _walletAddress || _signer?.toSuiAddress();
        this.poolIdToCoin = {};
        for (const poolName of Object.keys(this?.deployment?.RewardsPool || [])) {
            this.poolIdToCoin[this?.deployment?.RewardsPool?.[poolName]?.id] =
                this?.deployment?.RewardsPool?.[poolName]?.coin;
        }
    }

    /// signs and executes the provided sui transaction block
    async signAndExecuteTxBlock(
        transactionBlock: TransactionBlock,
        signer?: Signer
    ): Promise<SuiTransactionBlockResponse> {
        signer = signer || this.signer;

        transactionBlock.setSenderIfNotSet(this.walletAddress ?? signer.toSuiAddress());
        if (this.isZKLogin) {
            return this.executeZkTransaction({ caller: signer, tx: transactionBlock });
        } else if (this.isWalletExtension) {
            return this.executeWalletTransaction({
                caller: this.signer,
                tx: transactionBlock
            });
        } else {
            return this.executeTxBlock(transactionBlock, signer);
        }
    }

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

    private async executeTxBlock(
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
        return this.suiClient.executeTransactionBlock({
            transactionBlock: builtTransactionBlock,
            signature: transactionSignature.signature,
            options
        });
    }

    private executeZkTransaction = async ({
        tx,
        caller
    }: {
        tx: TransactionBlock;
        caller: Signer;
    }) => {
        tx.setSender(this.walletAddress as string);
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

    getZkPayload = (): ZkPayload => {
        return {
            decodedJWT: this.decodedJWT as DecodeJWT,
            proof: this.proof as PartialZkLoginSignature,
            salt: this.salt as string,
            maxEpoch: this.maxEpoch as number
        };
    };

    private async postCall(
        txb: TransactionBlock,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        if (multiSig) {
            txb.setSender(multiSig);
            return toB64(
                await txb.build({ client: this.suiClient, onlyTransactionKind: false })
            );
        } else {
            txb.setSender(this.signer.toSuiAddress());
            return this.signAndExecuteTxBlock(txb, this.signer);
        }
    }

    /**
     * Allows the caller to create the vault
     * @param vaultName name of the vault (the market maker) for which the vault is being created
     * @param operator the address of the trading account that will trade using vaults funds
     * @param holdingAccount the address of mm's holding account that can receive profits from the vault
     * @param claimsManager the address of account that can generate funds claim signature
     * @param maxCapacity max amount that can be locked in the vault
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async createVault(
        vaultName: string,
        operator: string,
        holdingAccount: string,
        claimsManager: string,
        maxCapacity: BigNumberable,
        vaultType: VaultType,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(this.deployment.BluefinSubAccounts),
                txb.object(this.deployment.BluefinBank),
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.string(vaultName),
                txb.pure.address(operator),
                txb.pure.address(holdingAccount),
                txb.pure.address(claimsManager),
                txb.pure.u64(toBigNumberStr(maxCapacity, USDC_DECIMALS)),
                txb.pure.u8(vaultType)
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::create_vault`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows the caller to create a non-trading vault
     * @param vaultName name of the vault (the market maker) for which the vault is being created
     * @param claimsManager the address of account that can generate funds claim signature
     * @param maxCapacity max amount that can be locked in the vault - This should be in 1eX format. Where `X` being the decimals supported by the vault coin
     * @param supportedCoinType the supported coin of the vault
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async createNonTradingVault(
        vaultName: string,
        claimsManager: string,
        maxCapacity: BigNumberable,
        supportedCoin: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.pure.string(vaultName),
                txb.pure.address(claimsManager),
                txb.pure.u64(bigNumber(maxCapacity).toFixed(0))
            ],
            typeArguments: [supportedCoin],
            target: `${this.deployment.Package}::bluefin_vault::create_non_trading_vault`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows admin of the protocol to create reward pools
     * @param rewardCoin The reward coin that will be funded into the pool and then claimed by users
     * @param controller The operator that will be creating reward signatures
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async createRewardPool(
        rewardCoin: string,
        controller?: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.pure.address(controller || this.signer.toSuiAddress())
            ],
            typeArguments: [rewardCoin],
            target: `${this.deployment.Package}::distributor::create_reward_pool`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows the caller to fund a rewards pool
     * @param pool the reward pool to which the amount will be deposited
     * @param amount the amount to be deposited into the pool (must be in base number, the method adds 9 decimal places)
     * @returns SuiTransactionBlockResponse
     */
    async fundRewardPool(
        pool: RewardPool,
        amount: BigNumberable
    ): Promise<SuiTransactionBlockResponse> {
        const txb = new TransactionBlock();

        // BLUE and SUI both rewards are in 9 decimals
        const amountEN = toBigNumber(amount, 9);

        const account = this.walletAddress || this.signer.toSuiAddress();

        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            amountEN,
            pool.coin,
            account
        );

        const args = [txb.object(pool.id), txb.object(splitCoin)];

        txb.moveCall({
            arguments: args,
            typeArguments: [pool.coin],
            target: `${this.deployment.Package}::distributor::fund_rewards_pool`
        });

        if (mergeCoin) {
            txb.transferObjects([mergeCoin as TransactionObjectArgument], account);
        }

        txb.setSender(this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to change the admin of the vault store
     * The caller must be the admin of provided vault store
     * @param newAdmin address of new vault store admin
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setVaultStoreAdmin(newAdmin: string, multiSig?: string) {
        const txb = new TransactionBlock();
        txb.moveCall({
            target: `${this.deployment.Package}::vaults::set_admin`,
            arguments: [
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.address(newAdmin)
            ]
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to set the vault bank manager on the bluefin vault store
     * The caller must be the admin of provided vault store
     * @param manager address of new bank manager
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setVaultBankManager(
        manager: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.address(manager)
            ],
            target: `${this.deployment.BluefinPackage}::vaults::set_vaults_bank_manger`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to set the vault claims manager for the provided vault
     * @param vaultName the name of the vault for which to update the manager
     * @param manager address of new claims manager
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setVaultClaimsManager(
        vaultName: string,
        manager: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const vault = this.getVaultID(vaultName);
        const vaultCoin = this.getVaultCoin(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(vault),
                txb.pure.address(manager)
            ],
            typeArguments: [vaultCoin],
            target: `${this.deployment.Package}::bluefin_vault::update_vault_claims_manager_account`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to set the vault bank manager on the bluefin vault store
     * The caller must be the admin of provided vault store
     * @param manager address of new bank manager
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setVaultOperator(
        vaultName: string,
        operator: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const vault = this.getVaultID(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(vault),
                txb.object(this.deployment.BluefinSubAccounts),
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.address(operator)
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::update_vault_operator`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to set the admin of vault store
     * The caller must be the admin of provided vault store
     * @param admin address of new admin
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setAdmin(
        admin: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.address(admin)
            ],
            target: `${this.deployment.BluefinPackage}::vaults::set_admin`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to set the controller of a reward pool
     * The caller must be the admin of package
     * @param controller address of new controller
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async setController(
        pool: string,
        controller: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        const rewardsPool = this.deployment.RewardsPool[pool];

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(rewardsPool.id),
                txb.pure.address(controller)
            ],
            typeArguments: [rewardsPool.coin],
            target: `${this.deployment.Package}::distributor::update_rewards_controller`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller to mark the provided nonce as claimed on-chain, effectively invalidating the
     * signature created using that nonce.
     * @param pool The name of the pool
     * @param nonce the nonce to be marked as claimed
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async markNonceAsClaimed(
        pool: string,
        nonce: NumStr,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        const rewardsPool = this.deployment.RewardsPool[pool];

        txb.moveCall({
            arguments: [txb.object(rewardsPool.id), txb.pure.u128(nonce)],
            typeArguments: [rewardsPool.coin],
            target: `${this.deployment.Package}::distributor::mark_nonce_as_claimed`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Returns the balance of the pool
     */
    async getPoolBalance(pool: string): Promise<BigNumber> {
        const rewardsPool = this.deployment.RewardsPool[pool];

        const obj = await this.suiClient.getObject({
            id: rewardsPool.id,
            options: {
                showContent: true
            }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return bigNumber((obj.data?.content as any).fields.reward_balance);
    }

    /**
     * Allows caller to pause a vault
     * The caller must be the admin of provided vault store
     * @param vaultName name of the vault(Nexus etc..)
     * @param pause boolean value to pause/unpause the vault
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async pauseVault(
        vaultName: string,
        pauseDeposit: boolean,
        pauseWithdraw: boolean,
        pauseClaim: boolean,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const vault = this.getVaultID(vaultName);
        const vaultCoin = this.getVaultCoin(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(vault),
                txb.pure.bool(pauseDeposit),
                txb.pure.bool(pauseWithdraw),
                txb.pure.bool(pauseClaim)
            ],
            typeArguments: [vaultCoin],
            target: `${this.deployment.Package}::bluefin_vault::pause_vault`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows caller(holding account of vault) to request profit withdraw from vault
     * @param vaultName name of the vault(Nexus etc..)
     * @param amount the amount of profit to withdraw
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async requestProfitWithdraw(
        vaultName: string,
        amount: BigNumberable
    ): Promise<SuiTransactionBlockResponse> {
        const vault = this.getVaultID(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.BluefinBank),
                txb.object(vault),
                txb.pure.u64(toBigNumberStr(amount, USDC_DECIMALS))
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::request_profit_withdraw_from_vault`
        });

        txb.setSender(this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows users to deposit funds into a vault
     * @param vaultName name of the vault(Nexus etc..)
     * @param amount the amount of tokens to deposit - should be in base number with NO EXTRA DECIMALS
     * @param options optional arguments
     *  - receiver: the address of the user that will receive deposited amount rewards on elixir
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async depositToVault(
        vaultName: string,
        amount: BigNumberable,
        options?: {
            receiver?: string;
        }
    ): Promise<SuiTransactionBlockResponse> {
        const receiver =
            options?.receiver || this.walletAddress || this.signer.toSuiAddress();

        const txb = new TransactionBlock();

        const account = this.walletAddress ?? this.signer.toSuiAddress();

        const vaultID = this.getVaultID(vaultName);
        const vaultType = this.getVaultType(vaultName);
        const vaultCoin = this.getVaultCoin(vaultName);
        const vaultDecimals = this.getVaultDecimals(vaultName);

        const amountEN = toBigNumber(amount, vaultDecimals);
        console.log(amountEN.toFixed(0));

        const [splitCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            this.suiClient,
            txb,
            amountEN,
            vaultCoin,
            account
        );

        if (vaultType != VaultType.NON_TRADING) {
            txb.moveCall({
                arguments: [
                    txb.object(this.deployment.BluefinBank),
                    txb.object(this.deployment.BluefinSequencer),
                    txb.object(vaultID),
                    txb.object(splitCoin),
                    txb.pure.u64(bigNumber(amountEN).toFixed(0)),
                    txb.pure.address(receiver)
                ],
                typeArguments: [vaultCoin],
                target: `${this.deployment.Package}::bluefin_vault::deposit_to_vault`
            });
        } else {
            txb.moveCall({
                arguments: [
                    txb.object(vaultID),
                    txb.object(splitCoin),
                    txb.pure.u64(bigNumber(amountEN).toFixed(0)),
                    txb.pure.address(receiver)
                ],
                typeArguments: [vaultCoin],
                target: `${this.deployment.Package}::bluefin_vault::deposit_to_non_trading_vault`
            });
        }

        if (mergeCoin) {
            txb.transferObjects([mergeCoin as TransactionObjectArgument], account);
        }

        if (splitCoin) {
            txb.transferObjects([splitCoin as TransactionObjectArgument], account);
        }

        txb.setSender(account);

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to move funds the bank account of a vault inside bluefin's margin bank
     * into the vault to hold for people to come in and withdraw
     * @param vaultName The name of the vault
     * @param amount The amount of funds to be moved
     */
    async moveWithdrawalFundsToVault(
        vaultName: string,
        amount: BigNumberable
    ): Promise<SuiTransactionBlockResponse> {
        const vault = this.getVaultID(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.BluefinBank),
                txb.object(this.deployment.BluefinVaultStore),
                txb.object(this.deployment.BluefinSequencer),
                txb.object(vault),
                txb.pure.u64(toBigNumberStr(amount, USDC_DECIMALS))
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::move_user_withdrawal_funds_to_vault`
        });

        txb.setSender(this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to move profit amount from the bank account of a vault inside bluefin's margin bank
     * to vault's holding account.
     * @param vaultName The name of the vault
     * @param amount The amount of funds to be moved
     */
    async moveProfitWithdrawalFundsToHoldingAccount(
        vaultName: string,
        amount: BigNumberable
    ): Promise<SuiTransactionBlockResponse> {
        const vault = this.getVaultID(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.BluefinBank),
                txb.object(this.deployment.BluefinVaultStore),
                txb.object(this.deployment.BluefinSequencer),
                txb.object(vault),
                txb.pure.u64(toBigNumberStr(amount, USDC_DECIMALS))
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::move_profit_withdrawal_funds_to_holding_account`
        });

        txb.setSender(this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to request withdraw their locked funds from provided vault
     * @param vaultName the name of the vault (partner name)
     * @param amount the amount of tokens to deposit - should be in base number with NO EXTRA DECIMALS
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async requestWithdrawFromVault(
        vaultName: string,
        amount: BigNumberable
    ): Promise<SuiTransactionBlockResponse> {
        const vaultID = this.getVaultID(vaultName);
        const vaultDecimals = this.getVaultDecimals(vaultName);
        const vaultCoin = this.getVaultCoin(vaultName);

        const amountEN = toBigNumber(amount, vaultDecimals);

        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(vaultID),
                txb.pure.u64(bigNumber(amountEN).toFixed(0))
            ],
            typeArguments: [vaultCoin],
            target: `${this.deployment.Package}::bluefin_vault::request_withdraw_from_vault`
        });

        txb.setSender(this.walletAddress ?? this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to claim withdrawn funds on a user's behalf
     * @param vaultName the name of the vault from which funds are to be claimed
     * @param payload The signature payload consisting of
     *    - target The address of reward pool from which to claim rewards
     *    - receiver The address for which to claim rewards
     *    - amount The amount of rewards to be claimed (Must be in 1e9 Format that the signer signed on)
     *    - nonce The unique nonce used by pool's operator to generate signature
     *    - type The type of signature payload (RewardsClaim | FundsClaim)
     * @param signature The signature created by pool's operator for provided payload
     */
    async claimFunds(
        vaultName: string,
        payload: typeof SignaturePayloadStruct.$inferType,
        signature: string
    ): Promise<SuiTransactionBlockResponse> {
        // serialize the payload data
        const serPayload = SignaturePayloadStruct.serialize(payload).toBytes();

        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(this.getVaultID(vaultName)),
                txb.pure.vector("u8", Array.from(serPayload)),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature)))
            ],
            typeArguments: [this.getVaultCoin(vaultName)],
            target: `${this.deployment.Package}::bluefin_vault::claim_withdrawn_funds`
        });

        txb.setSender(this.walletAddress ?? this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to batch claim
     * Input is array of
     * @param batch
     * payload: The signature payload consisting of
     *    - target The address of reward pool from which to claim rewards
     *    - receiver The address for which to claim rewards
     *    - amount The amount of rewards to be claimed (Must be in 1e9 Format that the signer signed on)
     *    - nonce The unique nonce used by pool's operator to generate signature
     *    - type The type of signature payload (RewardsClaim | FundsClaim)
     * signature: The signature created by pool's operator for provided payload
     */
    async claimFundsBatch(
        batch: {
            vaultName: string;
            payload: typeof SignaturePayloadStruct.$inferType;
            signature: string;
        }[]
    ): Promise<SuiTransactionBlockResponse> {
        const txb = new TransactionBlock();

        for (const tx of batch) {
            // serialize the payload data
            const serPayload = SignaturePayloadStruct.serialize(tx.payload).toBytes();

            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(tx.payload.target),
                    txb.pure.vector("u8", Array.from(serPayload)),
                    txb.pure.vector("u8", Array.from(hexStrToUint8(tx.signature)))
                ],
                typeArguments: [this.getVaultCoin(tx.vaultName)],
                target: `${this.deployment.Package}::bluefin_vault::claim_withdrawn_funds`
            });
        }

        txb.setSender(this.walletAddress ?? this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to claim rewards for the provided receiver from provided rewards pool
     * @param payload The signature payload consisting of
     *    - target The address of reward pool from which to claim rewards
     *    - receiver The address for which to claim rewards
     *    - amount The amount of rewards to be claimed (Must be in 1e9 Format that the signer signed on)
     *    - nonce The unique nonce used by pool's operator to generate signature
     *    - type The type of signature payload (RewardsClaim | FundsClaim)
     * @param signature The signature created by pool's operator for provided payload
     */
    async claimRewards(
        poolName: string,
        payload: typeof SignaturePayloadStruct.$inferType,
        signature: string
    ): Promise<SuiTransactionBlockResponse> {
        const pool = this.getRewardsPool(poolName);

        // serialize the payload data
        const serPayload = SignaturePayloadStruct.serialize(payload).toBytes();

        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(SUI_CLOCK_OBJECT_ID),
                txb.object(pool.id),
                txb.pure.vector("u8", Array.from(serPayload)),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature)))
            ],
            typeArguments: [pool.coin],
            target: `${this.deployment.Package}::distributor::claim_rewards`
        });

        txb.setSender(this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows caller to claim rewards for the provided receiver from provided rewards pool
     * @param batch consisting of
     * payload:  The signature payload consisting of
     *    - target The address of reward pool from which to claim rewards
     *    - receiver The address for which to claim rewards
     *    - amount The amount of rewards to be claimed (Must be in 1e9 Format that the signer signed on)
     *    - nonce The unique nonce used by pool's operator to generate signature
     *    - type The type of signature payload (RewardsClaim | FundsClaim)
     * signature: The signature created by pool's operator for provided payload
     */
    async claimRewardsBatch(
        batch: {
            payload: typeof SignaturePayloadStruct.$inferType;
            signature: string;
        }[]
    ): Promise<SuiTransactionBlockResponse> {
        const txb = new TransactionBlock();

        for (const tx of batch) {
            const coin = this.poolIdToCoin[tx.payload.target];

            // serialize the payload data
            const serPayload = SignaturePayloadStruct.serialize(tx.payload).toBytes();
            txb.moveCall({
                arguments: [
                    txb.object(SUI_CLOCK_OBJECT_ID),
                    txb.object(tx.payload.target),
                    txb.pure.vector("u8", Array.from(serPayload)),
                    txb.pure.vector("u8", Array.from(hexStrToUint8(tx.signature)))
                ],
                typeArguments: [coin],
                target: `${this.deployment.Package}::distributor::claim_rewards`
            });
        }

        txb.setSender(this.walletAddress || this.signer.toSuiAddress());

        return this.signAndExecuteTxBlock(txb, this.signer);
    }

    /**
     * Allows admin to update vault version
     * @param vaultName the name of the vault
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async updateVaultVersion(
        vaultName: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const vault = this.getVaultID(vaultName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [txb.object(this.deployment.AdminCap), txb.object(vault)],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::update_version_for_vault`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows admin to update rewards pool version
     * @param poolName the name of the rewards pool
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async updateRewardsPoolVersion(
        poolName: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const pool = this.getRewardsPool(poolName);

        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [txb.object(this.deployment.AdminCap), txb.object(pool.id)],
            typeArguments: [pool.coin],
            target: `${this.deployment.Package}::distributor::update_version_for_reward_pool`
        });

        return await this.postCall(txb, multiSig);
    }

    /**
     * Allows holder of the admin cap to transfer it to new user
     * @param newAdmin the address of new admin
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async transferAdminCap(
        newAdmin: string,
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(this.deployment.BluefinVaultStore),
                txb.pure.address(newAdmin)
            ],
            target: `${this.deployment.Package}::roles::transfer_admin_cap`
        });

        return await this.postCall(txb, multiSig);
    }
    /**
     * Allows admin to move locked funds from one vault to another
     * @param srcVault the name of source vault
     * @param destVault the name of destination vault
     * @param accounts the addresses of accounts that will be moved
     * @param multiSig optional multisig wallet address. if provided the method will return tx bytes of the tx instead of executing it
     * @returns SuiTransactionBlockResponse or transaction bytes
     */
    async moveFundsAcrossVaults(
        srcVault: string,
        destVault: string,
        accounts: string[],
        multiSig?: string
    ): Promise<SuiTransactionBlockResponse | string> {
        const txb = new TransactionBlock();

        txb.moveCall({
            arguments: [
                txb.object(this.deployment.AdminCap),
                txb.object(this.deployment.BluefinBank),
                txb.object(this.deployment.BluefinSequencer),
                txb.object(this.getVaultID(srcVault)),
                txb.object(this.getVaultID(destVault)),
                txb.pure.vector("address", accounts)
            ],
            typeArguments: [this.getSupportedCoin()],
            target: `${this.deployment.Package}::bluefin_vault::move_funds_across_vaults`
        });

        return await this.postCall(txb, multiSig);
    }

    /// Returns addresses of all users having any locked amount in provided vault
    async getVaultTVLProviders(vaultName: string): Promise<string[]> {
        const vaultID = this.getVaultID(vaultName);

        const obj = await this.suiClient.getObject({
            id: vaultID,
            options: {
                showContent: true
            }
        });

        const usersMapID = (obj.data?.content as any).fields.users.fields.id.id as string;
        let hasNextPage = true;
        let cursor = undefined;
        const users = [];
        while (hasNextPage) {
            const resp = await this.suiClient.getDynamicFields({
                parentId: usersMapID,
                cursor
            });

            users.push(...resp.data);

            hasNextPage = resp.hasNextPage;
            cursor = resp.nextCursor;
        }

        return users.map(u => u.name.value);
    }

    /// Returns user record for the provided vault

    async getUserRecordForVault(vaultName: string, user?: string): Promise<User> {
        const address = user || this.signer.toSuiAddress();
        const vaultID = this.getVaultID(vaultName);
        const userData: User = {
            amountLocked: "0",
            pendingWithdrawal: "0",
            shares: "0"
        };

        const obj = await this.suiClient.getObject({
            id: vaultID,
            options: {
                showContent: true
            }
        });

        const mapID = (obj.data?.content as any).fields.users.fields.id.id;

        try {
            const user = await this.suiClient.getDynamicFieldObject({
                parentId: mapID,
                name: {
                    type: "address",
                    value: address
                }
            });

            const fields = (user.data?.content as any).fields.value.fields;

            return {
                amountLocked: fields.amount_locked,
                pendingWithdrawal: fields.amount_locked,
                shares: fields.shares
            } as User;
        } catch (e) {
            console.log(`User does not exist for the vault`);
        }

        return userData;
    }
    /// Returns a user's current locked amount in provided vault
    async getUserLockedAmount(vaultName: string, user?: string): Promise<number> {
        const userData = await this.getUserRecordForVault(vaultName, user);
        return toBaseNumber(userData.amountLocked, 3, this.getVaultDecimals(vaultName));
    }

    /// Returns the pending amount for claim that user had requested for withdraw
    async getUserPendingWithdrawals(vaultName: string, user?: string): Promise<number> {
        const userData = await this.getUserRecordForVault(vaultName, user);
        return toBaseNumber(
            userData.pendingWithdrawal,
            3,
            this.getVaultDecimals(vaultName)
        );
    }

    /// Returns the total requested pending withdrawal amount yet to be moved to vault for user claims
    async getTotalPendingWithdrawalAmount(vaultName: string): Promise<number> {
        const vaultID = this.getVaultID(vaultName);
        const vaultDecimals = this.getVaultDecimals(vaultName);

        const obj = await this.suiClient.getObject({
            id: vaultID,
            options: {
                showContent: true
            }
        });

        return toBaseNumber(
            (obj.data?.content as any).fields.total_amount_to_be_withdrawn,
            3,
            vaultDecimals
        );
    }

    /// Returns current total amount locked in a given vault
    async getVaultLockedAmount(vaultName: string): Promise<number> {
        const vaultID = this.getVaultID(vaultName);

        const obj = await this.suiClient.getObject({
            id: vaultID,
            options: {
                showContent: true
            }
        });

        return toBaseNumber(
            (obj.data?.content as any).fields.total_locked_amount,
            3,
            this.getVaultDecimals(vaultName)
        );
    }

    /// Returns current total amount locked in a given vault
    async getVaultCoinBalance(vaultName: string): Promise<number> {
        const vaultID = this.getVaultID(vaultName);

        const obj = await this.suiClient.getObject({
            id: vaultID,
            options: {
                showContent: true
            }
        });

        return toBaseNumber(
            (obj.data?.content as any).fields.coin_balance,
            3,
            this.getVaultDecimals(vaultName)
        );
    }

    /// Returns the available withdrawable balance in the bluefin bank
    async getBluefinBankBalance(address?: string): Promise<number> {
        address = address || this.signer.toSuiAddress();

        const bankObj = await this.suiClient.getObject({
            id: this.deployment.BluefinBank,
            options: { showContent: true }
        });

        const bankTableID = (bankObj.data?.content as any).fields.accounts.fields.id.id;

        try {
            const availableBalance = await this.suiClient.getDynamicFieldObject({
                parentId: bankTableID,
                name: {
                    type: "address",
                    value: address
                }
            });

            return toBaseNumber(
                (availableBalance.data?.content as any).fields.value.fields.balance,
                3,
                TOKEN_DECIMALS
            );
        } catch (e) {
            return 0;
        }
    }

    /// Returns the balance of user (in base number, removes extra decimals)
    /// of the coin supported by provided vault
    async getCoinBalance(
        coinType: string,
        coinDecimals: number,
        address?: string
    ): Promise<number> {
        const account = address || this.walletAddress || this.signer.toSuiAddress();

        const balance = await CoinUtils.getCoinBalance(this.suiClient, account, coinType);

        return toBaseNumber(balance, 3, coinDecimals);
    }

    /// formulates the supported coin type, to be passed as `typeArguments` to contract calls
    getSupportedCoin(): string {
        return `${this.deployment.SupportedCoin}::coin::COIN`;
    }

    /// Returns the coin supported by the vault
    getVaultCoin(vaultName: string): string {
        return this.deployment.Vaults[vaultName]["coin"];
    }

    /// Returns the vault id
    getVaultID(vaultName: string): string {
        return this.deployment.Vaults[vaultName]["id"];
    }

    /// Returns the type of vault
    getVaultType(vaultName: string): VaultType {
        const type = Number(this.deployment.Vaults[vaultName]["type"]);
        switch (type) {
            case 1:
                return VaultType.NO_PNL_SHARING;
            case 2:
                return VaultType.PNL_SHARING;
            case 3:
                return VaultType.NON_TRADING;
            case 4:
                throw `Unknown vault type ${type} for ${vaultName}`;
        }
    }

    /// Returns the vault bank account
    getVaultAccount(vaultName: string): string {
        return this.deployment.Vaults[vaultName]["account"];
    }

    /// Returns the vault decimals
    getVaultDecimals(vaultName: string): number {
        return this.deployment.Vaults[vaultName]["decimals"];
    }

    /// Returns the reward pools data
    getRewardsPool(poolName: string): RewardPool {
        return this.deployment.RewardsPool[poolName];
    }
}
