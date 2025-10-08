import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { ed25519 } from "@noble/curves/ed25519";
import { BCSUtils } from "./bcs";
import { SIGNER_TYPES } from "../enums";
import { Serialized } from "../types";
import { Signer } from "../../types";
import { getSuiAddressFromPublicKey } from "../../library";
import { BcsType } from "@mysten/sui/bcs";
import { SignatureStruct } from "../../blv";
import { ISignature } from "../interfaces";

export class Signature {
    /// Returns serialized data bytes
    public static getSerializedDataBytes<T>(data: T, dataType: BcsType<T>): Uint8Array {
        return dataType.serialize(data).toBytes();
    }

    /// Returns serialized data sha256 hash bytes
    public static getDataHashBytes<T>(data: T, dataType: BcsType<T>): Uint8Array {
        return sha256(Signature.getSerializedDataBytes(data, dataType));
    }

    /// Returns serialized data sha256 hash hex
    public static getDataHashHex<T>(data: T, dataType: BcsType<T>): string {
        return bytesToHex(Signature.getDataHashBytes(data, dataType));
    }

    /**
     * Given a hex data string computes its sha256 hash and returns the hex
     * @param hexData a hex string
     * @returns hex sha256 hash
     */
    public static hash(hexData: string): string {
        return bytesToHex(sha256(hexToBytes(hexData)));
    }

    /**
     * Signs provided data bytes vector  using the provided signer
     * @param signer The signer object
     * @param data serialized data bytes to be signed
     * @param hash (optional) boolean, if provided the data will be sha256 hashed before signed
     * @returns bcs encoded signature hex
     */
    public static async signDataBytes(
        signer: Signer,
        data: Uint8Array,
        hash?: boolean
    ): Promise<Serialized> {
        const signature: ISignature = {
            sig: await signer.sign(hash ? sha256(data) : data),
            pk: signer.getPublicKey().toRawBytes(),
            scheme: signer.getKeyScheme() == "ED25519" ? 0 : 1
        };

        return BCSUtils.getSerializedDataHex(signature, SignatureStruct);
    }

    /**
     * Signs provided data hex using the provided signer
     * @param signer The signer object
     * @param data serialized data to be signed.
     * @param hash (optional) boolean, if provided the data will be sha256 hashed before signed
     * @returns bcs encoded signature hex
     */
    public static async signDataHex(
        signer: Signer,
        data: Serialized,
        hash?: boolean
    ): Promise<Serialized> {
        return await Signature.signDataBytes(signer, hexToBytes(data), hash);
    }

    /**
     * Deserializes the provided signature and returns the address of the signer
     * @param signature BCS serialized signature
     * @returns address of signer
     */
    public static getSuiAddressFromSignature(signature: Serialized): string {
        const sig = BCSUtils.deserializeData(signature, SignatureStruct);
        return getSuiAddressFromPublicKey(
            sig.pk as never,
            sig.scheme == 0 ? "ED25519" : "Secp256k1"
        );
    }

    /**
     * Given an array of data bytes and serialized signature returns true if the signature is valid
     * @param signature bcs serialized signature
     * @param data data bytes array
     * @returns True if signature is valid
     */
    public static verifySignatureFromBytes(
        signature: Serialized,
        data: Uint8Array
    ): boolean {
        try {
            const deSig = BCSUtils.deserializeData(signature, SignatureStruct);
            const hexSig = Buffer.from(deSig.sig as never).toString("hex");
            const pk = Uint8Array.from(deSig.pk);
            // todo add more types!
            switch (deSig.scheme) {
                case SIGNER_TYPES.KP_SECP256:
                    return this.verifySECP(hexSig, sha256(data), pk);
                case SIGNER_TYPES.KP_ED25519:
                    return ed25519.verify(hexSig, data, pk);
                default:
                    console.log("Signature is created using invalid signer type");
                    return false;
            }
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    /**
     * Given an array of data bytes and serialized signature returns true if the signature is valid
     * @param signature bcs serialized signature
     * @param data data in hex format
     * @param hash if provided, takes sha256 hash of the data
     * @returns True if signature is valid
     */
    public static verifySignatureFromHex(
        signature: Serialized,
        data: string,
        hash?: boolean
    ): boolean {
        return Signature.verifySignatureFromBytes(
            signature,
            hash ? sha256(hexToBytes(data)) : hexToBytes(data)
        );
    }

    /**
     * Validates if the provided signature is created using the data and public key provided
     * @param signature hex encoded signature
     * @param data data bytes
     * @param publicKey public key bytes
     * @returns True if signature is valid
     */
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
}
