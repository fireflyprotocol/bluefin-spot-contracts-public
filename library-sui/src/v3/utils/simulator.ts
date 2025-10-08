import { bytesToHex } from "@noble/hashes/utils";
import {
    AssetBankCreated,
    BCSUtils,
    InternalDeposit,
    PerpetualUpdate,
    SyncOperator,
    TradeData
} from "./bcs";
import { sha256 } from "@noble/hashes/sha256";
import { SuiClient } from "../../types";
import {
    IAssetBankDeposit,
    IDeployment,
    ITradeData,
    IOperatorUpdatedEvent,
    IFundingRate,
    IAssetBankCreated
} from "../interfaces";
import { DeploymentParser } from "./deployment-parser";
import { Address, NumStr, Operator, Serialized } from "../types";
import { hexStrToUint8, hexToBuffer } from "../../library";
import * as _ from "lodash";

export class MarginingEngineSimulator {
    suiClient: SuiClient;
    parser: DeploymentParser;

    /// 64 length sha256 hash of all tx processed till date
    private sequenceHash =
        "0000000000000000000000000000000000000000000000000000000000000000";

    constructor(suiClient: SuiClient, deployment: IDeployment) {
        this.suiClient = suiClient;
        this.parser = new DeploymentParser(deployment);
    }

    /**
     * Initializes the sequencer by fetching the on-chain sequence hash
     */
    async init() {
        const details = await this.suiClient.getObject({
            id: this.parser.getInternalDataStore(),
            options: { showContent: true }
        });
        this.sequenceHash = bytesToHex(
            new Uint8Array((details.data.content as any).fields.sequence_hash)
        );
    }

    /**
     * Creates sequence hash for a transaction
     * @param Serialized payload to be used for sequence hash computation
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @returns the new sequence hash
     */
    computeSequenceHash(
        payload: Serialized,
        update = true,
        sequenceHash?: string
    ): string {
        const newSequenceHash = bytesToHex(
            sha256(hexToBuffer(`${sequenceHash || this.sequenceHash}${payload}`))
        );

        if (update) {
            this.sequenceHash = newSequenceHash;
        }

        return newSequenceHash;
    }

    /**
     * Creates sequence hash for a deposit transaction
     * @param event AssetBankDeposit event
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @returns the new sequence hash
     */
    depositToInternalBank(event: IAssetBankDeposit, update = true): string {
        const serialized = BCSUtils.getSerializedDataHex(event, InternalDeposit);
        return this.computeSequenceHash(serialized, update);
    }

    /**
     * Creates sequence hash for sync perpetual state tx
     * @param event Event for any perpetual attribute update
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @returns the new sequence hash
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    syncPerpetual(event: any, update = true): string {
        let perpetual = { ...event.perpetual };

        // set oracle price to zero during serialization as on-chain
        // we bcs serialize the perpetual struct stored in EDS which has the oracle price zero
        perpetual.oraclePrice = 0;
        perpetual.funding = {
            timestamp: 0,
            rate: { value: 0, sign: true }
        } as IFundingRate;

        // the incoming event may have fields in snake_case
        perpetual = _.mapKeys(perpetual, (_v, k) =>
            _.camelCase(k)
        ) as typeof PerpetualUpdate.$inferType;

        const serialized = BCSUtils.getSerializedDataHex(perpetual, PerpetualUpdate);

        return this.computeSequenceHash(serialized, update);
    }

    /**
     * Creates sequence hash for sync support asset  tx
     * @param event Event for margin bank creation
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @returns the new sequence hash
     */
    syncSupportedAsset(event: IAssetBankCreated, update = true): string {
        const serialized = BCSUtils.getSerializedDataHex(event, AssetBankCreated);
        return this.computeSequenceHash(serialized, update);
    }

    /**
     * Creates sequence hash for trade tx
     * @param makerSignature The signature of the maker order
     * @param takerSignature The signature of the taker order
     * @param quantity The quantity of the trade bring filled
     * @param timestamp Timestamp in ms (this is sent to chain as well)
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @param sequenceHash (optional) sequence hash to be used to compute the next sequence hash
     * @returns the new sequence hash
     */
    performTrade(
        makerSignature: string,
        takerSignature: string,
        quantity: NumStr,
        timestamp: NumStr,
        update = true,
        sequenceHash?: string
    ): string {
        const trade = {
            makerSignature: hexStrToUint8(makerSignature),
            takerSignature: hexStrToUint8(takerSignature),
            quantity,
            timestamp
        } as ITradeData;

        const serialized = BCSUtils.getSerializedDataHex(trade, TradeData);
        return this.computeSequenceHash(serialized, update, sequenceHash);
    }

    /**
     * Creates sequence hash for sync support asset  tx
     * @param event Event for margin bank creation
     * @param update (optional) if true will update the stored sequence hash else will just return the new hash
     * @returns the new sequence hash
     */
    syncOperator(
        event:
            | IOperatorUpdatedEvent
            | {
                  operator_type: string;
                  previous_operator: Address;
                  new_operator: Address;
              },
        update = true
    ): string {
        const serialized = BCSUtils.getSerializedDataHex(
            {
                operatorType: event.operator_type as Operator,
                previousOperator: event.previous_operator,
                newOperator: event.new_operator
            },
            SyncOperator
        );
        return this.computeSequenceHash(serialized, update);
    }

    /// returns current sequence hash
    getSequenceHash() {
        return this.sequenceHash;
    }
}
