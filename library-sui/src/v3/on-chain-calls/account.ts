import { bcs } from "@mysten/bcs";
import { SUI_NATIVE_BASE, USDC_BASE_DECIMALS } from "../../constants";
import { bigNumber, toBaseNumber } from "../../library";
import { SuiClient, TransactionBlock } from "../../types";
import { DepositedAsset, IAccount, IPosition } from "../interfaces";
import { DeploymentParser } from "../utils";
import { Address } from "../types";

export default class Account {
    /**
     * Fetches the account details from on-chain from provided internal data store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched
     * @returns
     */
    static async getAccount(
        suiClient: SuiClient,
        storeID: string,
        account: string
    ): Promise<IAccount> {
        const objDetails = await suiClient.getObject({
            id: storeID,
            options: { showContent: true }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userTable = (objDetails.data.content as any).fields.accounts.fields.id.id;

        try {
            const userData = await suiClient.getDynamicFieldObject({
                parentId: userTable,
                name: {
                    type: "address",
                    value: account
                }
            });

            // parse the account
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fields = (userData.data.content as any).fields.value.fields;
            return {
                address: fields.address,
                assets: fields.assets.map(asset => asset.fields),
                crossPositions: fields.cross_positions.map(position =>
                    Account.mapPosition(position.fields)
                ),
                isolatedPositions: fields.isolated_positions.map(position =>
                    Account.mapPosition(position.fields)
                ),
                authorized: fields.authorized
            } as IAccount;
        } catch (e) {
            return {
                address: account,
                assets: [],
                crossPositions: [],
                isolatedPositions: [],
                authorized: []
            } as IAccount;
        }
    }

    /**
     * Fetches the user assets from on-chain from provided internal data store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched
     * @returns Array of Deposited Assets
     */
    static async getAccountAssets(
        suiClient: SuiClient,
        storeID: string,
        account: string
    ): Promise<Array<DepositedAsset>> {
        const data = await Account.getAccount(suiClient, storeID, account);
        return data.assets;
    }

    /**
     * Fetches the user margin from on-chain from provided internal data store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched
     * @returns The margin of the account in base number
     */
    static async getAccountMargin(
        suiClient: SuiClient,
        storeID: string,
        account: string
    ): Promise<number> {
        const data = await Account.getAccount(suiClient, storeID, account);
        return data.assets.length > 0
            ? toBaseNumber(data.assets[0].quantity, USDC_BASE_DECIMALS, SUI_NATIVE_BASE)
            : 0;
    }

    /**
     * Returns the margin user has available for withdrawal on-chain
     * @param suiClient Sui Client
     * @param parser The deployment config parser
     * @param account The account address for which to query withdrawable balance
     * @param asset The name of the asset that is to be queried
     * @returns The user available margin for withdraw in base number
     */
    static async getWithdrawableAssets(
        suiClient: SuiClient,
        parser: DeploymentParser,
        account: Address,
        asset: string
    ): Promise<number> {
        const txb = new TransactionBlock();
        txb.moveCall({
            arguments: [
                txb.object(parser.getInternalDataStore()),
                txb.pure.address(account),
                txb.pure.string(asset)
            ],
            target: `${parser.getPackageId()}::margining_engine::get_withdrawable_assets`
        });

        try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [availableMargin] = (
                await suiClient.devInspectTransactionBlock({
                    sender: account,
                    transactionBlock: txb
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                })
            ).results![0].returnValues!.map(([bytes, _]) =>
                bigNumber(bcs.u64().parse(Uint8Array.from(bytes)))
            );

            return toBaseNumber(availableMargin, 3, SUI_NATIVE_BASE);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Fetches the user positions from on-chain from provided internal data store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched
     * @returns
     */
    static async getAccountCrossPositions(
        suiClient: SuiClient,
        storeID: string,
        account: string
    ): Promise<Array<IPosition>> {
        const data = await Account.getAccount(suiClient, storeID, account);
        return data.crossPositions;
    }

    /**
     * Fetches the user position for provided perpetual from on-chain from provided internal data store
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched (address_1)
     * @param perpetual The address of the perpetual for which to fetch the position
     * @returns Position of the user on provided perp
     */
    static async getAccountCrossPositionForPerpetual(
        suiClient: SuiClient,
        storeID: string,
        account: string,
        perpetual: string
    ): Promise<IPosition> {
        const data = await Account.getAccount(suiClient, storeID, account);

        for (const position of data.crossPositions) {
            if (position.perpetual == perpetual) return position;
        }
        throw `Account ${account} has not position on perpetual: ${perpetual}`;
    }

    /**
     * Fetches the list of accounts/address that are authorized for given account
     * @param suiClient Sui Client
     * @param storeID The id/address of the internal store
     * @param account The address of user to be fetched (address_1)
     * @returns list of addresses
     */
    static async getAuthorizedAccounts(
        suiClient: SuiClient,
        storeID: string,
        account: string
    ): Promise<Array<string>> {
        const data = await Account.getAccount(suiClient, storeID, account);
        return data.authorized;
    }

    /**
     * Method to parse the position
     * @param fields the position fields
     * @returns IPosition
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static mapPosition(fields: any): IPosition {
        const position = { ...fields } as IPosition;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fundingFields = (position.funding as any).fields;

        position.funding = {
            timestamp: fundingFields.timestamp,
            rate: {
                value: fundingFields.rate.fields.value,
                sign: fundingFields.rate.fields.sign
            }
        };

        return position;
    }
}
