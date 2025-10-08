import { IAsset, IDeployment, IPerpetualConfig } from "../interfaces";
import { SupportedAssets } from "../types";

export class DeploymentParser {
    deployment: IDeployment;

    constructor(_deployment: IDeployment) {
        this.deployment = _deployment;
    }

    /// Adds provided perpetual to deployment file
    addPerpetual(perpConfig: IPerpetualConfig) {
        if (!this.deployment.Perpetuals) this.deployment.Perpetuals = {};

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.deployment.Perpetuals[perpConfig.symbol!] = perpConfig;
    }

    /// Returns provided perpetual object
    getPerpetual(perpName: string): IPerpetualConfig {
        return this.deployment.Perpetuals ? this.deployment.Perpetuals[perpName] : {};
    }

    /// Returns perpetual object for provided address
    getPerpetualUsingAddress(perpAddress: string): IPerpetualConfig {
        for (const perpName of Object.keys(this.deployment.Perpetuals)) {
            if (this.getPerpetualAddress(perpName) == perpAddress)
                return this.getPerpetual(perpName);
        }
    }

    /// Returns provided perpetual's id/address
    getPerpetualAddress(perpName: string): string {
        return this.getPerpetual(perpName).id;
    }

    /// Returns the id of internal data store
    getInternalDataStore(): string {
        return this.deployment.InternalDataStore;
    }

    getExternalDataStore(): string {
        return this.deployment.ExternalDataStore;
    }

    getAsset(assetSymbol: SupportedAssets): IAsset {
        return this.deployment.SupportedAssets[assetSymbol];
    }

    getAssetBank(assetSymbol: SupportedAssets): string {
        return this.getAsset(assetSymbol).bank;
    }

    getAdminCap(): string {
        return this.deployment.AdminCap;
    }

    getPackageId(): string {
        return this.deployment.Package;
    }

    getTreasuryCap(): string {
        return this.deployment.TreasuryCap;
    }

    getCurrency(assetSymbol: SupportedAssets): string {
        return this.getAsset(assetSymbol).currency;
    }
}
