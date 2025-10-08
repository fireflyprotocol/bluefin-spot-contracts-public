import { TransactionObjectArgument } from "@mysten/sui/transactions";
import { bigNumber } from "../library";
import {
    BigNumber,
    BigNumberable,
    CoinStruct,
    Keypair,
    PaginatedCoins,
    SuiAddress,
    SuiClient,
    SuiTransactionBlockResponse,
    TransactionBlock
} from "../types";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { SuiBlocks } from "./SuiBlocks";

export class CoinUtils {
    /**
     * Returns all coins owned by the provided address of provided type
     * @param suiClient Sui Client
     * @param owner the owner of the coins
     * @param coinType The type (address::coin::Coin) of the coin
     * @param options optional {limit, cursor}
     * @returns CoinStruct
     */
    static async getCoins(
        suiClient: SuiClient,
        owner: string,
        coinType: string
    ): Promise<CoinStruct[]> {
        const coins: PaginatedCoins["data"][number][] = [];
        let result: PaginatedCoins | undefined;

        do {
            result = await suiClient.getCoins({
                owner,
                coinType,
                cursor: result?.nextCursor
            });
            coins.push(...result.data);
        } while (result.hasNextPage);

        return coins;
    }

    /**
     * Returns the coin balance of the provided coin type for provided address
     * @param suiClient Sui Client
     * @param owner the owner of the coins
     * @param currencyType The type (address::coin::Coin) of the coin
     * @param options optional {limit, cursor}
     * @returns BigNumberable sum of all coin values
     */
    static async getCoinBalance(
        suiClient: SuiClient,
        owner: string,
        currencyType: string
    ): Promise<BigNumberable> {
        const coins = await CoinUtils.getCoins(suiClient, owner, currencyType);

        if (coins.length == 0) {
            return 0;
        } else {
            return CoinUtils.sumCoins(coins);
        }
    }

    /**
     * Returns the coins of provided type having the provided balance
     * @param suiClient Sui Client
     * @param amount the amount of coins we are looking for
     * @param owner The account address for which to find the coins
     * @param currencyType The type (address::coin::Coin) of the coin
     * @param options optional {limit, cursor}
     * @returns The coin struct of the coin and a boolean indicating if the coin has exact balance or more
     */
    static async getCoinHavingBalance(
        suiClient: SuiClient,
        amount: BigNumberable,
        owner: string,
        currencyType: string
    ): Promise<[CoinStruct, boolean]> {
        // get all coins of provided type
        const coins = await this.getCoins(suiClient, owner, currencyType);

        return CoinUtils.findCoinWithBalance(coins, amount);
    }

    /**
     * Creates a coin of provided quantity if possible
     * @param suiClient Sui Client
     * @param txb Transaction block
     * @param amount the amount of coins we are looking for
     * @param owner The account address for which to find the coins
     * @param coinType The type (address::coin::Coin) of the coin
     * @returns Txb and The new coin of provided amount
     */
    static async createCoinWithBalance(
        suiClient: SuiClient,
        txb: TransactionBlock,
        amount: BigNumberable,
        coinType: string,
        owner: string
    ): Promise<any[]> {
        let mergeCoin;
        let hasExactBalance = false;

        const amountBN = new BigNumber(amount);

        // if amount is zero, return zero coin
        if (amountBN.isEqualTo(bigNumber(0))) {
            return [CoinUtils.zeroCoin(txb, coinType), undefined];
        }

        // get all available coins the user has of provided type
        const availableCoins = CoinUtils.sortAscending(
            await CoinUtils.getCoins(suiClient, owner, coinType)
        );

        // sum up the balance of all coins
        const availableCoinsBalanceBN = new BigNumber(CoinUtils.sumCoins(availableCoins));

        // if the total balance is < asked amount, throw
        if (amountBN.isGreaterThan(availableCoinsBalanceBN)) {
            throw `User: ${owner} does not have enough coins: ${coinType}`;
        }

        // if sui coin use the gas coin object
        if (CoinUtils.isSUI(coinType)) {
            return [txb.splitCoins(txb.gas, [txb.pure.u64(amountBN.toFixed())])];
        } else {
            // find a coin with balance >= amount
            [mergeCoin, hasExactBalance] = CoinUtils.findCoinWithBalance(
                availableCoins,
                amount
            );

            // if there is no one coin with balance >= amount
            // merge coins
            if (mergeCoin == undefined) {
                // set first coin as base/target
                mergeCoin = txb.object(availableCoins[0].coinObjectId);

                // merge all other coins in the first coin
                txb.mergeCoins(
                    mergeCoin,
                    availableCoins.slice(1).map(coin => txb.object(coin.coinObjectId))
                );
            } else {
                mergeCoin = txb.object(mergeCoin.coinObjectId);
            }
        }

        /// If the coin has exact the balance needed, return it as the `splitCoin` and
        /// send the merge coin as undefined as there is none
        /// If the coin has more balance than required, split it and send the splitCoin
        /// and whatever is remaining in merge coin
        return hasExactBalance
            ? [mergeCoin, undefined]
            : [txb.splitCoins(mergeCoin, [txb.pure.u64(amountBN.toFixed())]), mergeCoin];
    }

    /**
     * Transfers the amount of coin type to the receiver
     * @param suiClient Sui Client
     * @param amount The amount of
     * @param coinType The type (address::coin::Coin) of the coin
     * @param receiver The address of the receiver
     * @param signer The sender's singer | keypair
     * @param isUIWallet True if being used by UI wallet
     * @returns SuiTransactionBlockResponse
     */
    static async transferCoin(
        suiClient: SuiClient,
        amount: BigNumberable,
        coinType: string,
        receiver: string,
        signer: Keypair,
        isUIWallet = false
    ): Promise<SuiTransactionBlockResponse> {
        const sender = signer.toSuiAddress();

        let txb = new TransactionBlock();

        txb = await CoinUtils.createTransferCoinTransaction(
            txb,
            suiClient,
            amount,
            coinType,
            receiver,
            sender
        );

        // sign the tx
        const txSignature = await SuiBlocks.buildAndSignTxBlock(
            txb,
            suiClient,
            signer,
            isUIWallet
        );

        return SuiBlocks.executeSignedTxBlock(txSignature, suiClient);
    }

    /**
     * Transfers all the coins of provided type
     * @param suiClient Sui Client
     * @param coinType The type (address::coin::Coin) of the coin
     * @param receiver The address of the receiver
     * @param signer The sender's singer | keypair
     * @param isUIWallet True if being used by UI wallet
     * @returns SuiTransactionBlockResponse
     */
    static async transferAllCoins(
        suiClient: SuiClient,
        coinType: string,
        receiver: string,
        signer: Keypair,
        isUIWallet = false
    ): Promise<SuiTransactionBlockResponse> {
        const sender = signer.toSuiAddress();

        let txb = new TransactionBlock();

        txb = await CoinUtils.createTransferAllTransaction(
            txb,
            suiClient,
            coinType,
            receiver,
            sender
        );

        // sign the tx
        const txSignature = await SuiBlocks.buildAndSignTxBlock(
            txb,
            suiClient,
            signer,
            isUIWallet
        );

        return SuiBlocks.executeSignedTxBlock(txSignature, suiClient);
    }

    /**
     * Creates a transaction for transferring coin
     * @param txb Transaction Block
     * @param suiClient Sui Client
     * @param amount The amount of
     * @param coinType The type (address::coin::Coin) of the coin
     * @param receiver The address of the receiver
     * @param signer The sender's singer | keypair
     * @param isUIWallet True if being used by UI wallet
     * @returns SuiTransactionBlockResponse
     */
    static async createTransferCoinTransaction(
        txb: TransactionBlock,
        suiClient: SuiClient,
        amount: BigNumberable,
        coinType: string,
        receiver: string,
        sender: SuiAddress
    ): Promise<TransactionBlock> {
        // get the coins
        const [sendCoin, mergeCoin] = await CoinUtils.createCoinWithBalance(
            suiClient,
            txb,
            amount,
            coinType,
            sender
        );

        // transfer send coin to receiver
        txb.transferObjects([sendCoin], receiver);

        // transfer any lingering merge coin back to sender
        if (mergeCoin) {
            txb.transferObjects([mergeCoin as TransactionObjectArgument], sender);
        }

        return txb;
    }

    /**
     * Creates a transaction for transferring all the coins of provided type
     * @param txb Transaction Block
     * @param suiClient Sui Client
     * @param coinType The type (address::coin::Coin) of the coin
     * @param receiver The address of the receiver
     * @param signer The sender's singer | keypair
     * @param isUIWallet True if being used by UI wallet
     * @returns SuiTransactionBlockResponse
     */
    static async createTransferAllTransaction(
        txb: TransactionBlock,
        suiClient: SuiClient,
        coinType: string,
        receiver: string,
        sender: SuiAddress
    ): Promise<TransactionBlock> {
        const coins = await CoinUtils.getCoins(suiClient, sender, coinType);

        if (coins.length == 0)
            throw `No coin of type: ${coinType} available for transfer`;

        const mergeCoin = txb.object(coins[0].coinObjectId);

        // merge all other coins in the first coin
        txb.mergeCoins(
            mergeCoin,
            coins.slice(1).map(coin => txb.object(coin.coinObjectId))
        );

        // transfer merged coin to receiver
        txb.transferObjects([mergeCoin], receiver);

        return txb;
    }

    /**
     * Sums the balance of provided coins
     * @param coins Paginated coin array
     * @returns Sum of all coins
     */
    static sumCoins(coins: CoinStruct[]): BigNumberable {
        return coins.reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (total: number, coin: any) => total + +coin.balance,
            0
        );
    }

    /**
     * Finds the coin having the provided balance. If none then returns undefined
     * @param coins Paginated coin array
     * @param amount The amount of balance the coin must have
     * @returns CoinStruct of the coin and boolean indicating if the coin has exact balance or more
     */
    static findCoinWithBalance(
        coins: CoinStruct[],
        amount: BigNumberable
    ): [CoinStruct, boolean] {
        for (const coin of coins) {
            const a = bigNumber(coin.balance);
            const b = bigNumber(amount);

            if (a.gte(b)) {
                return [coin, a.eq(b)];
            }
        }
        return [undefined, false];
    }

    /**
     * Makes a zero coin of provided type
     * @param txb Transaction block
     * @param coinType Coin Type
     * @returns TransactionObjectArgument
     */
    static zeroCoin(txb: TransactionBlock, coinType: string): TransactionObjectArgument {
        return txb.moveCall({
            target: "0x2::coin::zero",
            typeArguments: [coinType]
        });
    }

    /**
     * Returns true if the provided is SUI
     * @param coinType
     * @returns true if the coin type is SUI
     */
    static isSUI(coinType: string): boolean {
        const normalizedAddress = normalizeSuiAddress(coinType);
        return (
            normalizedAddress ===
                "0x0000000000000000000000000000000000000000000000000000000000000002::sui::sui" ||
            normalizedAddress ===
                "0x000000000000000000000000000000000000000000000000000002::sui::sui"
        );
    }

    /**
     * Sorts the provided coin structs in ascending order
     * @param coins The CoinStruct to sort
     * @returns The sorted CoinStruct objects.
     */
    static sortAscending(coins: CoinStruct[]): CoinStruct[] {
        return coins.sort((a, b) =>
            bigNumber(a.balance).lt(bigNumber(b.balance))
                ? -1
                : bigNumber(a.balance).gt(bigNumber(b.balance))
                ? 1
                : 0
        );
    }
}
