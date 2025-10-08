import { Serialized } from "../types";

export interface IRequestPayload {
    rawData: unknown;
    serializedData: Serialized;
    signature: Serialized;
}
