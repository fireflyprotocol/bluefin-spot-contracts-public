import { SuiClient } from "../types";
import { Address, ID } from "../v3/types";
import { asIntN } from "./clmm";
import { IPosition } from "./interfaces/IPosition";
import BN from "bn.js";
import { Pool } from "./types";

export class QueryChain {
    suiClient: SuiClient;

    constructor(_suiClient: SuiClient) {
        this.suiClient = _suiClient;
    }

    /// Returns pool state from chain
    async getPool(id: ID): Promise<Pool> {
        const suiObjectResponse = await this.suiClient.getObject({
            id: id,
            options: { showContent: true }
        });

        const type = (suiObjectResponse.data?.content as any).type;
        const coinTypes = type.replace(">", "").split("<")[1]?.split(/,\s*/) || [];
        const fields = (suiObjectResponse.data?.content as any).fields;

        const metadataA = await this.suiClient.getCoinMetadata({
            coinType: coinTypes[0]
        });
        const metadataB = await this.suiClient.getCoinMetadata({
            coinType: coinTypes[1]
        });

        return {
            // identification
            id: fields.id.id,
            name: fields.name,
            fee_rate: Number(fields.fee_rate),

            // coins info
            coin_a: {
                address: coinTypes[0],
                balance: fields.coin_a,
                decimals: metadataA.decimals
            },
            coin_b: {
                address: coinTypes[1],
                balance: fields.coin_b,
                decimals: metadataB.decimals
            },

            // liquidity, tick and price info
            current_sqrt_price: fields.current_sqrt_price,
            current_tick: Number(
                asIntN(BigInt(fields.current_tick_index.fields.bits)).toString()
            ),
            liquidity: fields.liquidity,

            // is pool paused
            is_paused: fields.is_paused,

            // managers
            ticks_manager: fields.ticks_manager.fields,
            observations_manager: fields.observations_manager.fields,
            rewardsInfo: fields.reward_infos.map(info => {
                info = info.fields;
                return {
                    ended_at_seconds: Number(info.ended_at_seconds),
                    last_update_time: Number(info.last_update_time),
                    reward_coin_decimals: Number(info.reward_coin_decimals),
                    reward_coin_symbol: info.reward_coin_symbol,
                    reward_coin_type: info.reward_coin_type,
                    reward_growth_global: info.reward_growth_global,
                    reward_per_seconds: info.reward_per_seconds,
                    total_reward: Number(info.total_reward),
                    total_reward_allocated: Number(info.total_reward_allocated)
                };
            }),
            protocol_fee_coin_a: Number(fields.protocol_fee_coin_a),
            protocol_fee_coin_b: Number(fields.protocol_fee_coin_b)
        } as Pool;
    }

    /// Returns a pool's liquidity
    async getPoolLiquidity(poolName: string): Promise<number> {
        const poolState = await this.getPool(poolName);
        return Number(poolState.liquidity);
    }

    /// Returns a pool's current price
    async getPoolCurrentPrice(poolName: string): Promise<BN> {
        const poolState = await this.getPool(poolName);
        return new BN(poolState.current_sqrt_price);
    }

    /// Returns
    async getPoolCurrentTick(poolName: string): Promise<BN> {
        const poolState = await this.getPool(poolName);
        return new BN(poolState.current_tick);
    }

    /// Returns the details of the provided position from chain
    async getPositionDetails(id: ID): Promise<IPosition> {
        const resp = await this.suiClient.getObject({
            id,
            options: {
                showOwner: true,
                showContent: true
            }
        });

        return QueryChain.parsePositionObject(resp);
    }

    /**
     * Returns a user's open position on bluefin spot protocol
     * @param pkg  The base package of the protocol (this is not CurrentPackage)
     * @param user The address of the user for which to query positions
     * @param pool (optional) The ID of the pool for which to query position.
     *             Defaults to none and returns all positions across all pools
     * @returns Array<IPosition>
     */
    async getUserPositions(
        pkg: Address,
        user: Address,
        pool?: ID
    ): Promise<Array<IPosition>> {
        let positions: Array<IPosition> = [];

        const objType = `${pkg}::position::Position`;

        let cursor = undefined;
        let hasNextPage = true;

        while (hasNextPage) {
            const resp = await this.suiClient.getOwnedObjects({
                owner: user,
                cursor,
                options: {
                    showType: true,
                    showOwner: true,
                    showContent: true
                }
            });

            hasNextPage = resp.hasNextPage;
            cursor = resp.nextCursor;

            positions = positions.concat(
                resp.data
                    .filter(obj => obj.data.type == objType)
                    .map(obj => {
                        return QueryChain.parsePositionObject(obj);
                    })
                    .filter(position => pool == undefined || position.pool_id == pool)
            );
        }

        return positions;
    }

    static parsePositionObject(resp: any): IPosition {
        const onChainPosition = (resp.data.content as any).fields;

        return {
            owner: (resp.data.owner as any).AddressOwner,
            pool_id: onChainPosition.pool_id,
            position_id: onChainPosition.id.id,
            lower_tick: Number(
                asIntN(BigInt(onChainPosition.lower_tick.fields.bits)).toString()
            ),
            upper_tick: Number(
                asIntN(BigInt(onChainPosition.upper_tick.fields.bits)).toString()
            ),
            liquidity: Number(onChainPosition.liquidity),
            fee_growth_coin_a: Number(onChainPosition.fee_growth_coin_a),
            fee_growth_coin_b: Number(onChainPosition.fee_growth_coin_b),
            fee_rate: Number(onChainPosition.fee_rate),
            token_a_fee: Number(onChainPosition.token_a_fee),
            token_b_fee: Number(onChainPosition.token_b_fee)
        } as any as IPosition;
    }
}
