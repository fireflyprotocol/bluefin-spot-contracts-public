import { toB64 } from "@mysten/sui/utils";
import { ExtendedWalletContextState, ZkTransactionParams } from "../interfaces";
import {
    DryRunTransactionBlockResponse,
    Keypair,
    SignatureWithBytes,
    SuiClient,
    SuiTransactionBlockResponse,
    SuiTransactionBlockResponseOptions,
    TransactionBlock
} from "../types";
import { createZkSignature } from "../utils";

export class SuiBlocks {
    /**
     * Signs and executes transaction using zk login
     * @param args : ZKTransaction
     * @returns SuiTransactionBlockResponse
     */
    static async executeTransactionUsingZkWallet(
        args: ZkTransactionParams
    ): Promise<SuiTransactionBlockResponse> {
        args.txBlock.setSender(args.zkAddress);
        const { bytes, signature: userSignature } = await args.txBlock.sign({
            client: args.suiClient,
            signer: args.caller as Keypair
        });
        const zkSignature = createZkSignature({
            userSignature,
            zkPayload: args.zkPayload
        });
        return args.suiClient.executeTransactionBlock({
            transactionBlock: bytes,
            signature: zkSignature,
            options: {
                showObjectChanges: true,
                showEffects: true,
                showEvents: true,
                showInput: true
            }
        });
    }

    /**
     * Builds the transaction block. If the signer is an UI Wallet, then it
     * does not support signing of `Uint8Array`, so just return the block.
     * @param txBlock Sui Transaction block
     * @returns Built tx block Uin8tArray
     */
    static async buildTxBlock(
        txBlock: TransactionBlock,
        suiClient: SuiClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signerAddress: string,
        uiWallet?: boolean
    ): Promise<Uint8Array | TransactionBlock> {
        txBlock.setSenderIfNotSet(signerAddress);

        return uiWallet
            ? txBlock
            : await txBlock.build({
                  client: suiClient
              });
    }

    /**
     * Signs the provided sui transaction block. The `uiWallet` flag controls
     * whether signer is an UI Wallet or a backend one; for the UI Wallet,
     * we still need to use `signTransactionBlock`, which receives a
     * `TransactionBlock` instead of `Uint8Array`.
     *
     * @param builtBlock the sui transaction block or transaction block bytes
     * @param signer
     * @param uiWallet whether the wallet is a browser extension one or not
     * @returns signature along with tx block bytes
     */
    static async signTxBlock(
        builtBlock: Uint8Array | TransactionBlock,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signer: any,
        // pass in true if signer is from UI wallet
        uiWallet?: boolean
    ): Promise<SignatureWithBytes> {
        if (uiWallet) {
            const response = await (
                signer as unknown as ExtendedWalletContextState
            ).signTransactionBlock({
                transactionBlock: builtBlock as TransactionBlock
            });

            return {
                bytes: response.transactionBlockBytes,
                signature: response.signature
            };
        } else {
            return signer.signTransaction(builtBlock as Uint8Array);
        }
    }

    /**
     * Builds and signs a TransactionBlock.
     * @param txBlock the sui transaction block
     * @param suiClient
     * @param signer
     * @param uiWallet whether the wallet is a browser extension one or not
     * @returns
     */
    static async buildAndSignTxBlock(
        txBlock: TransactionBlock,
        suiClient: SuiClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signer: any,
        uiWallet?: boolean
    ): Promise<SignatureWithBytes> {
        const builtBlock = await this.buildTxBlock(
            txBlock,
            suiClient,
            signer.toSuiAddress(),
            uiWallet
        );

        return this.signTxBlock(builtBlock, signer, uiWallet);
    }

    /**
     * signs the provided sui transaction bytes
     * @param txBytes the sui transaction block bytes
     * @returns signature along with tx block bytes
     */
    static async signTxBytes(
        txBytes: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signer: any
    ): Promise<SignatureWithBytes> {
        return TransactionBlock.from(txBytes).sign({ signer });
    }

    /**
     * Executes the signed sponsored tx block
     * @param blockTxBytes transaction block bytes
     * @param userSignature the signature of the user/caller
     * @param sponsorSignature the signature of the sponsor paying the gas fee of tx
     * @param suiClient the sui client
     * @param options (optional) by default returns complete tx details
     * @returns SuiTransactionBlockResponse
     */
    static async executeSponsoredTxBlock(
        blockTxBytes: string,
        userSignature: string,
        sponsorSignature: string,
        suiClient: SuiClient,
        options: SuiTransactionBlockResponseOptions = {
            showObjectChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true
        }
    ): Promise<SuiTransactionBlockResponse> {
        return suiClient.executeTransactionBlock({
            transactionBlock: blockTxBytes,
            signature: [userSignature, sponsorSignature],
            options,
            requestType: "WaitForLocalExecution"
        });
    }

    /**
     * Executes the signed transaction block
     * @param signedTxBlock signed transaction block
     * @param suiClient the sui client
     * @param options (optional) by default returns complete tx details
     * @returns SuiTransactionBlockResponse
     */
    static async executeSignedTxBlock(
        signedTxBlock: SignatureWithBytes,
        suiClient: SuiClient,
        options: SuiTransactionBlockResponseOptions = {
            showObjectChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true
        }
    ): Promise<SuiTransactionBlockResponse> {
        return suiClient.executeTransactionBlock({
            transactionBlock: signedTxBlock.bytes,
            signature: signedTxBlock.signature,
            options
        });
    }

    /**
     * Builds gasless payload bytes from given transaction block
     * @param txb transaction block
     * @param suiClient sui client
     * @returns transaction payload bytes string
     */
    static async buildGaslessTxPayloadBytes(
        txb: TransactionBlock,
        suiClient: SuiClient
    ): Promise<string> {
        return toB64(
            await txb.build({
                client: suiClient,
                onlyTransactionKind: true
            })
        );
    }

    /**
     * Signs and executes the given transaction block
     * @param txBlock Sui transaction block
     * @param suiClient The sui client to be used
     * @param signer The signer that will be singing the Tx
     * @param isUIWallet (optional) is the signer UI wallet? defaults to `False`
     * @param options (optional) the response fields user wants to see in `SuiTransactionBlockResponse`
     * @returns Sui Transaction Block Response
     */
    static async signAndExecuteTxBlock(
        txBlock: TransactionBlock,
        suiClient: SuiClient,
        signer: any,
        isUIWallet = false,
        options: SuiTransactionBlockResponseOptions = {
            showObjectChanges: true,
            showEffects: true,
            showEvents: true,
            showInput: true
        }
    ): Promise<SuiTransactionBlockResponse> {
        const signedBlock = await SuiBlocks.buildAndSignTxBlock(
            txBlock,
            suiClient,
            signer,
            isUIWallet
        );

        return SuiBlocks.executeSignedTxBlock(signedBlock, suiClient, options);
    }

    /**
     * Executes dry run for the given tx block
     * @param txBlock Sui transaction block
     * @param suiClient The sui client to be used
     * @param signer The signer that will be singing the Tx
     * @param isUIWallet (optional) is the signer UI wallet? defaults to `False`
     * @returns Sui Transaction Block Response
     */
    static async dryRunTxBlock(
        txBlock: TransactionBlock,
        suiClient: SuiClient,
        signer: any,
        isUIWallet = false
    ): Promise<DryRunTransactionBlockResponse> {
        const builtBlock = (await SuiBlocks.buildTxBlock(
            txBlock,
            suiClient,
            signer.toSuiAddress(),
            isUIWallet
        )) as Uint8Array;

        return suiClient.dryRunTransactionBlock({
            transactionBlock: builtBlock
        });
    }

    /**
     *  Dry runs or executes the call on chain depending on the params
     * @param dryRun True if dry run is to be performed
     * @param txBlock The transaction block
     * @returns DryRunTransactionBlockResponse | SuiTransactionBlockResponse
     */
    static async execCall(
        txBlock: TransactionBlock,
        suiClient: SuiClient,
        signer: any,
        dryRun: boolean,
        isUIWallet = false
    ): Promise<DryRunTransactionBlockResponse | SuiTransactionBlockResponse> {
        return dryRun == true
            ? await SuiBlocks.dryRunTxBlock(txBlock, suiClient, signer, isUIWallet)
            : await SuiBlocks.signAndExecuteTxBlock(
                  txBlock,
                  suiClient,
                  signer,
                  isUIWallet
              );
    }
}
