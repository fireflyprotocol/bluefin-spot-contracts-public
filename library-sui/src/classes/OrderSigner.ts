import { bcs } from "@mysten/sui/bcs";

import { IntentScope, messageWithIntent, Signer } from "@mysten/sui/cryptography";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { blake2b } from "@noble/hashes/blake2b";
import { sha256 } from "@noble/hashes/sha256";
import { SIGNER_TYPES } from "../enums";
import { Order, SignedOrder, ZkPayload } from "../interfaces/order";
import { base64ToUint8, bnToHex, encodeOrderFlags, hexToBuffer } from "../library";
import { BaseWallet, SigPK } from "../types";
import { createZkSignature, parseAndShapeSignedData } from "../utils";
import base58 from "bs58";
import { sign } from "tweetnacl";

export class OrderSigner {
    constructor(private signer: Signer) {}

    public async getSignedOrder(order: Order, signer?: Signer): Promise<SignedOrder> {
        const typedSignature = await this.signOrder(order, signer);
        return {
            ...order,
            typedSignature: `${typedSignature.signature}${typedSignature.publicKey}`
        };
    }

    public async signOrder(order: Order, signer?: Signer): Promise<SigPK> {
        const caller = signer || this.signer;

        // serialize order
        const msgData = new TextEncoder().encode(OrderSigner.getSerializedOrder(order));
        // take sha256 hash of order
        const msgHash = sha256(msgData);
        const publicKey = caller.getPublicKey().toBase64();
        const keyScheme = caller.getKeyScheme();

        let signatureType = null;
        let signatureInput = null;

        if (keyScheme == "Secp256k1") {
            // sign the raw data
            signatureType = SIGNER_TYPES.KP_SECP256;
            signatureInput = msgData;
        } else if (keyScheme == "ED25519") {
            // in case of ed25519 we sign the hashed msg
            signatureType = SIGNER_TYPES.KP_ED25519;
            signatureInput = msgHash;
        } else {
            throw "Invalid wallet type";
        }

        const sign = await caller.sign(signatureInput);

        const signature = Buffer.from(sign).toString("hex") + signatureType;
        return { signature, publicKey };
    }

    static async signOrderUsingZkSignature({
        order,
        signer,
        zkPayload
    }: {
        order: Order;
        signer: Signer;
        zkPayload: ZkPayload;
    }): Promise<SigPK> {
        // serialize order
        const msgData = new TextEncoder().encode(OrderSigner.getSerializedOrder(order));

        // take sha256 hash of order
        const msgHash = sha256(msgData);

        // sign data
        const { signature } = await signer.signPersonalMessage(msgHash);

        const zkSignature = createZkSignature({
            userSignature: signature,
            zkPayload
        });
        return parseAndShapeSignedData({ signature: zkSignature });
    }

    /**
     * Signs the order using the provided wallet context
     * @param order order to be signed
     * @param wallet wallet context
     * @returns signature and public key
     */
    static async signOrderUsingWallet(order: Order, wallet: BaseWallet): Promise<SigPK> {
        // serialize order
        const msgData = new TextEncoder().encode(OrderSigner.getSerializedOrder(order));

        // take sha256 hash of order
        const msgHash = sha256(msgData);

        // sign data
        const { signature } = await wallet.signPersonalMessage({ message: msgHash });
        return parseAndShapeSignedData({ signature });
    }

    public async signPayload(payload: unknown, keyPair?: Signer): Promise<SigPK> {
        const signer = keyPair || this.signer;

        const encodedData = OrderSigner.encodePayload(payload);

        const publicKey = signer.getPublicKey().toBase64();

        const keyScheme = signer.getKeyScheme();

        let signatureType = null;

        if (keyScheme == "Secp256k1") {
            signatureType = SIGNER_TYPES.KP_SECP256;
        } else if (keyScheme == "ED25519") {
            signatureType = SIGNER_TYPES.KP_ED25519;
        } else {
            throw "Invalid wallet type";
        }

        const sign = await signer.sign(encodedData);

        const signature = Buffer.from(sign).toString("hex") + signatureType;

        return { signature, publicKey };
    }

    static async signPayloadUsingZKSignature({
        payload,
        signer,
        zkPayload
    }: {
        payload: unknown;
        signer: Signer;
        zkPayload: ZkPayload;
    }): Promise<SigPK> {
        const msgBytes = new TextEncoder().encode(JSON.stringify(payload));
        const { signature } = await signer.signPersonalMessage(msgBytes);
        const zkSignature = createZkSignature({
            userSignature: signature,
            zkPayload
        });
        return parseAndShapeSignedData({ signature: zkSignature });
    }
    static async signBytesPayloadUsingZKSignature({
        payload,
        signer,
        zkPayload
    }: {
        payload: Uint8Array;
        signer: Signer;
        zkPayload: ZkPayload;
    }): Promise<SigPK> {
        const { signature } = await signer.signPersonalMessage(payload);
        const zkSignature = createZkSignature({
            userSignature: signature,
            zkPayload
        });
        return parseAndShapeSignedData({ signature: zkSignature });
    }
    static async signPayloadUsingWallet(
        payload: unknown,
        wallet: BaseWallet,
        useDeprecatedSigningMethod?: boolean
    ): Promise<SigPK> {
        const msgBytes = new TextEncoder().encode(JSON.stringify(payload));
        // Doing this to support Gate Wallet which does not support SignPersonalMessage
        if (useDeprecatedSigningMethod) {
            const { signature } = await wallet.signMessage({
                message: msgBytes
            });
            return parseAndShapeSignedData({ signature });
        }
        const { signature } = await wallet.signPersonalMessage({
            message: msgBytes
        });
        return parseAndShapeSignedData({ signature });
    }
    public static encodePayload(
        payload: unknown,
        intentScope: IntentScope = "PersonalMessage"
    ): Uint8Array {
        const msgBytes = new TextEncoder().encode(JSON.stringify(payload));

        const size = 1024 + Math.floor(msgBytes.length / 1024) * 1024;

        const intentMsg = messageWithIntent(
            intentScope,
            bcs.vector(bcs.U8).serialize(msgBytes).toBytes()
        );
        const encodeData = blake2b(intentMsg, { dkLen: 32 });

        return encodeData;
    }

    public static verifySignature(
        payload: unknown,
        signature: string,
        publicKey: string
    ): boolean {
        const encodedData = OrderSigner.encodePayload(payload);

        const pkBytes = base64ToUint8(publicKey);

        // if last index of string is zero, the signature is generated using secp wallet
        const char = signature.slice(-1);
        // remove last character/index from signature
        signature = signature.slice(0, -1);

        if (char == SIGNER_TYPES.KP_SECP256) {
            return this.verifySECP(signature, sha256(encodedData), pkBytes);
        } else if (char == SIGNER_TYPES.KP_ED25519 || char == SIGNER_TYPES.UI_ED25519) {
            return ed25519.verify(signature, encodedData, pkBytes);
        } else {
            throw "Invalid signature type";
        }
    }

    public static verifyPhantomWalletSignature(
        payload: unknown,
        signature: string,
        publicKey: string
    ): boolean {
        const pkBytes = base58.decode(publicKey);
        const encodedData = new TextEncoder().encode(JSON.stringify(payload));
        const sigBytes = new Uint8Array(Buffer.from(signature, "hex"));
        return sign.detached.verify(encodedData, sigBytes, pkBytes);
    }

    /**
     * Verifies if the given signature is correct or not using the raw order
     * @param order the order used to create the signature
     * @param signature the generated signature in hex string
     * @param publicKey signer's public key in base64 str
     * @returns True if the signature is valid
     */
    public static verifySignatureUsingOrder(
        order: Order,
        signature: string,
        publicKey: string
    ): boolean {
        const serializedOrder = OrderSigner.getSerializedOrder(order);
        const encodedOrder = new TextEncoder().encode(serializedOrder);
        const orderHash = sha256(encodedOrder);
        const pkBytes = base64ToUint8(publicKey);

        // if last index of string is zero, the signature is generated using secp wallet
        const char = signature.slice(-1);
        // remove last character/index from signature
        signature = signature.slice(0, -1);

        if (char == SIGNER_TYPES.KP_SECP256) {
            return this.verifySECP(signature, orderHash, pkBytes);
        } else if (char == SIGNER_TYPES.KP_ED25519) {
            return ed25519.verify(signature, orderHash, pkBytes);
        } else if (char == SIGNER_TYPES.UI_ED25519) {
            const intentMsg = messageWithIntent(
                "PersonalMessage",
                bcs.vector(bcs.U8).serialize(orderHash).toBytes()
            );
            const signedData = blake2b(intentMsg, { dkLen: 32 });

            return ed25519.verify(signature, signedData, pkBytes);
        }

        return false;
    }

    public static verifySECP(
        signature: string,
        data: Uint8Array,
        publicKey: Uint8Array
    ): boolean {
        const sig_r_s = secp256k1.Signature.fromCompact(signature);
        const sig_r_s_b1 = sig_r_s.addRecoveryBit(0x1);
        const recovered_pk_1 = sig_r_s_b1
            .recoverPublicKey(data)
            .toRawBytes(true)
            .toString();

        const sig_r_s_b0 = sig_r_s.addRecoveryBit(0x0);
        const recovered_pk_0 = sig_r_s_b0
            .recoverPublicKey(data)
            .toRawBytes(true)
            .toString();

        return (
            publicKey.toString() === recovered_pk_1 ||
            publicKey.toString() === recovered_pk_0
        );
    }

    public static getSerializedOrder(order: Order): string {
        // encode order flags
        const orderFlags = encodeOrderFlags(order);

        const buffer = Buffer.alloc(144);
        buffer.set(hexToBuffer(bnToHex(order.price)), 0);
        buffer.set(hexToBuffer(bnToHex(order.quantity)), 16);
        buffer.set(hexToBuffer(bnToHex(order.leverage)), 32);
        buffer.set(hexToBuffer(bnToHex(order.salt)), 48);
        buffer.set(hexToBuffer(bnToHex(order.expiration, 16)), 64);
        buffer.set(hexToBuffer(order.maker), 72);
        buffer.set(hexToBuffer(order.market), 104);
        buffer.set(hexToBuffer(bnToHex(orderFlags, 2)), 136);
        buffer.set(Buffer.from("Bluefin", "utf8"), 137);

        return buffer.toString("hex");
    }

    public static getOrderHash(order: Order | string): string {
        // if serialized order is not provided
        if (typeof order !== "string") {
            order = OrderSigner.getSerializedOrder(order);
        }
        const hash = sha256(hexToBuffer(order));
        return Buffer.from(hash).toString("hex");
    }

    public getPublicKeyStr(keypair?: Signer) {
        const signer = keypair || this.signer;
        return signer.getPublicKey().toBase64();
    }
}
