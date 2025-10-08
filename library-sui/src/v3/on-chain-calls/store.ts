import { ADDRESSES } from "../../constants";
import { SuiClient } from "../../types";
import { PRUNE_TABLES } from "../enums";
import { IPerpetualConfig } from "../interfaces";
import { Address, Operator } from "../types";

export default class Store {
    /**
     * Fetches the content of perpetual from the store. The store id could belong to EDS or IDS
     * @param suiClient Sui Client
     * @param storeID The id/address of the store. Could belong to EDS or IDS
     * @param perpAddress The address of the perpetual to be fetched
     * @param isExternalStore (optional) defaults to false
     * @returns
     */
    static async getPerpetualFromStore(
        suiClient: SuiClient,
        storeID: string,
        perpAddress: string,
        isExternalStore?: boolean
    ): Promise<IPerpetualConfig> {
        const objDetails = await suiClient.getObject({
            id: storeID,
            options: { showContent: true }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perpTable = (objDetails.data.content as any).fields.perpetuals.fields.id.id;

        const perpetual = await suiClient.getDynamicFieldObject({
            parentId: perpTable,
            name: {
                type: "address",
                value: perpAddress
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields = (perpetual.data.content as any).fields.value.fields;

        return isExternalStore ? fields.perpetual.fields : fields;
    }

    /**
     * Fetches the whitelisted  operator address from the provided store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param operator The name of the operator to query
     * @returns address of funding operator if set else returns ZERO address
     */
    static async getOperator(
        suiClient: SuiClient,
        storeID: string,
        operator: Operator
    ): Promise<Address> {
        const objDetails = await suiClient.getObject({
            id: storeID,
            options: { showContent: true }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const operatorsTable = (objDetails.data.content as any).fields.operators.fields.id
            .id;

        const entry = await suiClient.getDynamicFieldObject({
            parentId: operatorsTable,
            name: {
                type: "0x1::string::String",
                value: operator
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return entry.error ? ADDRESSES.ZERO : (entry.data.content as any).fields.value;
    }

    /**
     * Returns the keys of the requested table
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param type the table type for which to get keys
     * @param maxLimit The max number of hashes to be returned
     */
    static async getTableKeys(
        suiClient: SuiClient,
        storeID: string,
        type: PRUNE_TABLES,
        maxLimit = -1
    ): Promise<Array<Uint8Array>> {
        const objDetails = await suiClient.getObject({
            id: storeID,
            options: { showContent: true }
        });

        const fields = (objDetails.data.content as any).fields;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableID =
            type == PRUNE_TABLES.HISTORY
                ? fields.hashes.fields.id.id
                : fields.filled_orders.fields.id.id;

        let pages = [];
        let nextCursor = undefined;
        let hasNextPage = true;
        while (hasNextPage) {
            const data = await suiClient.getDynamicFields({
                parentId: tableID,
                cursor: nextCursor
            });
            nextCursor = data.nextCursor;
            hasNextPage = data.hasNextPage;
            pages = [...pages, ...data.data];

            // if we have reached the max required hashes, slice and return
            if (maxLimit > -1 && pages.length > maxLimit) {
                pages = pages.slice(0, maxLimit);
                break;
            }
        }

        return pages.map(d => d.name.value as Uint8Array);
    }
}
