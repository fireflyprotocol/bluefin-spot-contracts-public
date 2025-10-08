import { Signer, SuiClient } from "../types";
import { IAccount, IDeployment, IPerpetualConfig } from "./interfaces";
import { AdminCalls, UserCalls, SequencerCalls, TxBuilder } from "./on-chain-calls";
import Account from "./on-chain-calls/account";
import Store from "./on-chain-calls/store";
import { RequestsBuilder } from "./requests-builder";
import { MarginingEngineSimulator } from "./utils";
import { DeploymentParser } from "./utils/deployment-parser";

export class BluefinV3 {
    suiClient: SuiClient;
    signer: Signer;
    parser: DeploymentParser;
    walletAddress: string;
    txBuilder: TxBuilder;
    admin: AdminCalls;
    user: UserCalls;
    sequencer: SequencerCalls;
    requests: RequestsBuilder;
    simulator: MarginingEngineSimulator;
    network: string;

    constructor(
        _network: string,
        _suiClient: SuiClient,
        _deployment: IDeployment,
        _signer?: Signer,
        _walletAddress?: string
    ) {
        this.network = _network;
        this.suiClient = _suiClient;
        this.parser = new DeploymentParser(_deployment);
        // could be undefined, if initializing the bluefinV3 for only get calls
        this.signer = _signer as Signer;

        this.walletAddress = _walletAddress || (_signer?.toSuiAddress() as string);

        this.txBuilder = new TxBuilder(_deployment);

        this.admin = new AdminCalls(
            _network,
            _suiClient,
            _deployment,
            _signer,
            _walletAddress
        );
        this.user = new UserCalls(
            _network,
            _suiClient,
            _deployment,
            _signer,
            _walletAddress
        );
        this.sequencer = new SequencerCalls(
            _network,
            _suiClient,
            _deployment,
            _signer,
            _walletAddress
        );
        this.requests = new RequestsBuilder(_deployment, _signer, _walletAddress);

        this.simulator = new MarginingEngineSimulator(_suiClient, _deployment);
    }

    /**
     * Returns on-chain data of provided perpetual from EDS
     * @param perpName Name of the perpetual
     */
    public async getPerpetualFromEDS(perpName: string): Promise<IPerpetualConfig> {
        return Store.getPerpetualFromStore(
            this.suiClient,
            this.parser.getExternalDataStore(),
            this.parser.getPerpetualAddress(perpName),
            true
        );
    }

    /**
     * Returns on-chain data of provided perpetual from IDS
     * @param perpName Name of the perpetual
     */
    public async getPerpetualFromIDS(perpName: string): Promise<IPerpetualConfig> {
        return Store.getPerpetualFromStore(
            this.suiClient,
            this.parser.getInternalDataStore(),
            this.parser.getPerpetualAddress(perpName)
        );
    }

    /**
     * Returns account state from chain
     * @param account (optional) address of the user
     */
    public async getAccountStateOnChain(account?: string): Promise<IAccount> {
        return Account.getAccount(
            this.suiClient,
            this.parser.getInternalDataStore(),
            account || this.walletAddress
        );
    }
}
