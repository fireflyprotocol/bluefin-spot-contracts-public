import fs from "fs";
import {
    SuiEvent,
    SuiObjectChange,
    SuiTransactionBlockResponse
} from "@mysten/sui/client";
import { ObjectsMap } from "./interface";
import { OnChainCallResponse } from "../types";

// Decimals used by SUI and BLUE coin
export const TOKEN_DECIMALS = 9;

// Decimals used by USDC coin
export const USDC_DECIMALS = 6;

export async function sleep(timeInMs: number) {
    await new Promise(resolve => setTimeout(resolve, timeInMs));
}

export function getEvent(
    txResponse: SuiTransactionBlockResponse,
    eventName: string
): SuiEvent[] {
    const events = [];
    for (const event of txResponse.events || []) {
        if (event.type.endsWith(eventName)) events.push(event);
    }

    return events;
}

export function getCreatedObjectsIDs(txResponse: OnChainCallResponse): ObjectsMap {
    const objects: ObjectsMap = {};

    for (const object of (txResponse as any).objectChanges as SuiObjectChange[]) {
        if (object.type == "mutated") continue;
        // only Packages get published
        if (object.type == "published") {
            objects["Package"] = object.packageId;
        } else if (object.type == "created") {
            try {
                const type = (
                    object.objectType.match(
                        /^(?<pkg>[\w]+)::(?<mod>[\w]+)::(?<type>[\w]+)$/
                    )?.groups as any
                )["type"];
                objects[type] = object.objectId;
            } catch (e) {
                // eslint-disable-next-line
                const match = object.objectType.match(/(?<=\::)(.*?)(?=\<)/)[0];
                const type = match.split("::")[1];
                if (type == "CoinMetadata") {
                    objects["Currency"] =
                        // eslint-disable-next-line
                        object.objectType.match(/(?<=\<)(.*?)(?=\>)/)[0];
                } else {
                    objects[type] = object.objectId;
                }
            }
        }
    }

    return objects;
}

export function readJSONFile(filePath: string) {
    return fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath).toString())
        : {};
}

export function writeJSONFile(filePath: string, content: JSON) {
    fs.writeFileSync(filePath, JSON.stringify(content));
}

export function hexToUint8Array(hex: string): Uint8Array {
    // Remove the '0x' prefix if present
    if (hex.startsWith("0x") || hex.startsWith("0X")) {
        hex = hex.slice(2);
    }
    // Ensure even length
    if (hex.length % 2 !== 0) {
        hex = "0" + hex;
    }
    const byteArray = new Uint8Array(hex.length / 2);
    for (let i = 0; i < byteArray.length; i++) {
        byteArray[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return byteArray;
}

const CHUNK_SIZE = 8192;
export function toBase64(bytes: Uint8Array): string {
    // Special-case the simple case for speed's sake.
    if (bytes.length < CHUNK_SIZE) {
        return btoa(String.fromCharCode(...bytes));
    }

    let output = "";
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.slice(i, i + CHUNK_SIZE);
        output += String.fromCharCode(...chunk);
    }

    return btoa(output);
}

export function fromBase64(base64String: string): Uint8Array {
    return Uint8Array.from(atob(base64String), char => char.charCodeAt(0));
}

export function toHex(bytes: Uint8Array): string {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");
}
