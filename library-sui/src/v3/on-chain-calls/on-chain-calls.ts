import {
    DryRunTransactionBlockResponse,
    OnChainCallResponse,
    Signer,
    SuiClient,
    SuiTransactionBlockResponse,
    TransactionBlock
} from "../../../src/types";
import { DeploymentParser } from "../utils/deployment-parser";
import { IBluefinV3OptionalParams, IDeployment } from "../interfaces";
import { TxBuilder } from "./tx-builder";
import { SuiBlocks, Transaction } from "../../classes";
import { Address, Serialized } from "../types";
import { sleep } from "../../blv";
import { hexStrToUint8 } from "../../library";

export class OnChainCalls {
    suiClient: SuiClient;
    signer: Signer;
    parser: DeploymentParser;
    walletAddress: string;
    txBuilder: TxBuilder;
    network: string;

    constructor(
        _network: string,
        _suiClient: SuiClient,
        _deployment: IDeployment,
        _signer?: Signer,
        _walletAddress?: Address
    ) {
        this.network = _network;
        this.suiClient = _suiClient;
        this.parser = new DeploymentParser(_deployment);
        // could be undefined, if initializing the bluefinV3 for only get calls
        this.signer = _signer as Signer;

        this.walletAddress = _walletAddress || (_signer?.toSuiAddress() as string);

        this.txBuilder = new TxBuilder(_deployment);
    }

    /**
     * Signs and executes the given transaction block
     * @param txBlock Sui transaction block
     * @returns Sui Transaction Block Response
     */
    async signAndExecuteTxBlock(
        txBlock: TransactionBlock
    ): Promise<SuiTransactionBlockResponse> {
        return SuiBlocks.signAndExecuteTxBlock(txBlock, this.suiClient, this.signer);
    }

    /**
     * Signs and executes the given transaction block
     * @param txBlock Sui transaction block
     * @returns Sui Transaction Block Response
     */
    async dryRunTxBlock(
        txBlock: TransactionBlock
    ): Promise<DryRunTransactionBlockResponse> {
        return SuiBlocks.dryRunTxBlock(txBlock, this.suiClient, this.signer);
    }

    /**
     *  Dry runs or executes the call on chain depending on the params
     * @param dryRun True if dry run is to be performed
     * @param txBlock The transaction block
     * @returns
     */
    async execCall(
        txBlock: TransactionBlock,
        options?: IBluefinV3OptionalParams
    ): Promise<OnChainCallResponse> {
        if (options?.dryRun) {
            return this.dryRunTxBlock(txBlock);
        } else if (options?.returnTxb) {
            return txBlock;
        } else {
            // TODO remove these sleeps for production
            await sleep(1000);
            const response = await this.signAndExecuteTxBlock(txBlock);
            await sleep(1000);
            return response;
        }
    }

    async verifySignature(
        data: Serialized,
        signature: Serialized,
        verbose = false
    ): Promise<boolean> {
        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.pure.vector("u8", Array.from(hexStrToUint8(data))),
                txb.pure.vector("u8", Array.from(hexStrToUint8(signature)))
            ],
            target: `${this.parser.getPackageId()}::utils::validate_signature`
        });

        const result = await this.suiClient.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signer.toSuiAddress()
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = Transaction.getStatus(result as any);

        if (verbose) console.log(JSON.stringify(result));

        return status == "success";
    }
}
