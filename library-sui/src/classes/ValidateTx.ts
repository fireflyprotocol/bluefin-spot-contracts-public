import { fromB64 } from "@mysten/sui/utils";
import { TransactionBlock } from "../types";
import { BLUEFIN_PACKAGES } from "../constants";

// Add more methods in this array down the road
const SPONSORED_TX_METHODS = [
    "margin_bank::deposit_to_bank",
    "margin_bank::withdraw_from_bank",
    "exchange::add_margin",
    "exchange::remove_margin",
    "exchange::adjust_leverage",
    "exchange::close_position",
    "roles::set_sub_account"
];

const WHITELISTED_KINDS = ["MergeCoins"];

const SPONSORED_TX = [];
for (const method of SPONSORED_TX_METHODS) {
    for (const env of Object.keys(BLUEFIN_PACKAGES)) {
        for (const version of BLUEFIN_PACKAGES[env]) {
            SPONSORED_TX.push(`${version}::${method}`);
        }
    }
}

export class ValidateTx {
    /**
     * Given a base 64 encoded sponsored transaction bytes, returns true
     * if all the transactions in the block are whitelisted to be sponsored
     * by bluefin dec
     * @param txBytesB64 base 64 sponsored tx block bytes
     * @returns true/false
     */
    static isWhitelistedForSponsor(txBytesB64: string): boolean {
        const txBytes = fromB64(txBytesB64);
        const txBlock = TransactionBlock.fromKind(txBytes);
        const transactions = txBlock.blockData.transactions;

        for (const tx of transactions) {
            // if the tx type is not in SPONSORED_TX return false
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (
                SPONSORED_TX.indexOf((tx as any).target) == -1 &&
                WHITELISTED_KINDS.indexOf(tx.kind) == -1
            )
                return false;
        }

        // if we are here, implies all tx in the block are whitelisted to be sponsored return true
        return true;
    }
}
