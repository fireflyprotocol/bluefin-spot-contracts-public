import { UserPositionExtended } from "../interfaces";
import { ERROR_CODES } from "../errors";
import BigNumber from "bignumber.js";
import { SignedNumberToBigNumber } from "../library";
import { OnChainCallResponse, SuiTransactionBlockResponse } from "../types";

export class Transaction {
    static getStatus(tx: OnChainCallResponse) {
        return (tx as any).effects?.status.status;
    }

    // if no error returns error code as 0
    static getErrorCode(tx: OnChainCallResponse): number | undefined {
        if (Transaction.getStatus(tx) == "failure") {
            const error = (tx as any).effects?.status.error as string;

            return error.lastIndexOf(",") > 0
                ? Number(error.slice(error.lastIndexOf(",") + 2, error.lastIndexOf(")")))
                : undefined;
        }
        return 0;
    }

    static getError(tx: OnChainCallResponse, errorCodes = ERROR_CODES): string {
        const code = Transaction.getErrorCode(tx);
        if ((code as number) > 0) {
            return (errorCodes as any)[code as number];
        } else if (code == undefined) {
            return (tx as any).effects?.status.error as string;
        } else {
            return "";
        }
    }

    static getDryRunErrorCode(error: string): number {
        const regex = /}, [0-9]+[)]/;
        const match = error.match(regex);
        let code = "0";
        if (match) {
            code = match[0].replace(/\D/g, "");
        }
        return Number(code);
    }

    static getDryRunError(error: string): string {
        const code = Transaction.getDryRunErrorCode(error);
        return ERROR_CODES[code];
    }

    static getTxNumber(error: string): number {
        const regex = /(\d+)(?!.*\d)/;
        const match = error.match(regex);
        if (match) {
            return Number(match[0]);
        }
        return -1;
    }

    static getEvents(tx: OnChainCallResponse, eventName?: string): Array<any> {
        let events = [];

        if ((tx as any)?.events) {
            if (eventName != "") {
                events = (tx as any)?.events
                    ?.filter((x: any) => x.type.indexOf(eventName) >= 0)
                    .map((x: any) => {
                        return x.parsedJson;
                    });
            }
        }

        return events;
    }

    static getCreatedObjectIDs(tx: OnChainCallResponse, onlyShared?: boolean): string[] {
        const ids: string[] = [];
        const objects = (tx as any).effects?.created as any[];
        for (const itr in objects) {
            // if looking for only shared objects
            if (onlyShared) {
                if (objects[itr].owner.Shared != undefined)
                    ids.push(objects[itr].reference.objectId);
            } else {
                ids.push(objects[itr].reference.objectId);
            }
        }
        return ids;
    }

    static getAllMutatedObjectIDs(tx: OnChainCallResponse): string[] {
        const ids: string[] = [];
        const objects = (tx as any).objectChanges as any[];
        for (const itr in objects) {
            ids.push(objects[itr].objectId);
        }
        return ids;
    }

    static getMutatedObjectsUsingType(tx: OnChainCallResponse, type: string): string[] {
        const objects = (tx as any).objectChanges as any[];
        const ids: string[] = [];
        for (const itr in objects) {
            if (objects[itr].objectType.indexOf(type) > 0) {
                ids.push(objects[itr].objectId);
            }
        }
        return ids;
    }

    static getObjectsFromEvents(
        tx: OnChainCallResponse,
        list: string,
        objectType: string
    ): object[] {
        const objects: object[] = [];

        const events = (tx as any).events as any;

        for (const ev of events) {
            const obj = ev[list];
            if (obj !== undefined) {
                const objType = obj["type"]
                    .slice(obj["type"].lastIndexOf("::") + 2)
                    .replace(/[^a-zA-Z ]/g, "");
                if (objectType == "" || objType == objectType) {
                    objects.push({
                        id: obj["id"],
                        dataType: objType,
                        data: obj["parsedJson"]
                    } as object);
                }
            }
        }
        return objects;
    }

    static getAccountPosition(
        tx: OnChainCallResponse,
        address: string
    ): UserPositionExtended {
        const events = Transaction.getEvents(tx, "AccountPositionUpdateEvent");
        let userPosition: UserPositionExtended;
        if (events[0].position.user == address) userPosition = events[0].position;
        else if (events[1].position.user == address) userPosition = events[1].position;
        else throw `AccountPositionUpdate event not found for address: ${address}`;

        return userPosition;
    }

    static getAccountPNL(tx: OnChainCallResponse, address: string): BigNumber {
        const events = Transaction.getEvents(tx, "TradeExecuted");

        if (events.length == 0) {
            throw "No TradeExecuted event found in tx";
        }

        if (address == events[0].maker) {
            return SignedNumberToBigNumber(events[0].makerPnl);
        } else if (address == events[0].taker) {
            return SignedNumberToBigNumber(events[0].takerPnl);
        } else {
            throw `TradeExecuted event not found for address: ${address}`;
        }
    }

    static getAccountBankBalance(tx: OnChainCallResponse, address: string): BigNumber {
        const events = Transaction.getEvents(tx, "BankBalanceUpdate");

        if (!address.startsWith("0x")) {
            address = "0x" + address;
        }

        if (events.length == 0) {
            return BigNumber(0);
        }

        // assuming the first event will have latest bank balance for account
        for (const ev of events) {
            if (ev.fields.destAddress == address) {
                return BigNumber(ev.fields.destBalance);
            } else if (ev.fields.srcAddress == address) {
                return BigNumber(ev.fields.srcBalance);
            }
        }
        return BigNumber(0);
    }

    // assumes if there was any object created, it was bank account
    static getBankAccountID(tx: OnChainCallResponse): string {
        // if an object is created its bank account
        const createdObjects = this.getCreatedObjectIDs(tx);
        const mutatedObjects = this.getMutatedObjectsUsingType(tx, "BankAccount");
        if (createdObjects.length > 0) {
            return createdObjects[0];
        } else if (mutatedObjects.length > 0) {
            return mutatedObjects[0];
        } else {
            return "";
        }
    }

    static getTxGasCost(tx: OnChainCallResponse): number {
        tx = tx as SuiTransactionBlockResponse;

        return (
            Number(tx.effects.gasUsed.computationCost) +
            Number(tx.effects.gasUsed.nonRefundableStorageFee) +
            Number(tx.effects.gasUsed.storageCost) -
            Number(tx.effects.gasUsed.storageRebate)
        );
    }
}
