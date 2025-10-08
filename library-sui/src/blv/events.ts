import { VaultType } from "./enums";

export interface BankBalanceUpdateV2 {
    action: number;
    srcAddress: string;
    destAddress: string;
    amount: string;
    srcBalance: string;
    destBalance: string;
    txIndex: number;
}

export interface CreatedVaultEvent {
    vaultID: string;
    vaultBankAccount: string;
    vaultName: string;
    vaultType: VaultType;
    maxCap: string;
    operator: string;
    holdingAccount: string;
    claimsManager: string;
}

export interface WithdrawEvent {
    vaultID: string;
    receiver: string;
    amountWithdrawn: string;
    userPendingWithdrawal: string;
    userLockedAmount: string;
    totalPendingWithdrawal: string;
    sequenceNumber: number;
}

export interface FundsClaimedEvent {
    vaultID: string;
    caller: string;
    receiver: string;
    amount: string;
    userPendingWithdrawalAmount: string;
    vaultBalance: string;
    nonce: number;
    sequenceNumber: number;
}

export interface DepositEvent {
    vaultID: string;
    amountDeposited: string;
    receiver: string;
    sender: string;
    userTotalAmount: string;
    vaultTotalAmount: string;
    sequenceNumber: number;
}

export interface FundsMovedToVault {
    vaultID: string;
    amount: string;
    withdrawalAmountRemaining: string;
    vaultTotalLockedAmount: string;
    vaultCoins: string;
    sequenceNumber: number;
}

export interface ProfitWithdrawRequest {
    vaultID: string;
    amount: string;
    totalPendingProfitAmount: string;
    sequenceNumber: number;
}

export interface ProfitMovedToHoldingAccount {
    vaultID: string;
    amount: string;
    totalPendingProfitAmount: string;
    sequenceNumber: number;
}

export interface VaultOperatorUpdateEvent {
    vaultID: string;
    account: string;
}

export interface VaultHoldingAccountUpdateEvent {
    vaultID: string;
    account: string;
}

export interface VaultClaimsManagerUpdateEvent {
    vaultID: string;
    account: string;
}

export interface VaultPauseUpdateEvent {
    vaultID: string;
    depositPaused: boolean;
    withdrawPaused: boolean;
    claimPaused: boolean;
}

export interface VaultMaxCapUpdateEvent {
    vaultID: string;
    maxCap: string;
}

export interface CreatedRewardsPoolEvent {
    poolID: string;
    controller: string;
}

export interface RewardsAmountDepositedEvent {
    poolID: string;
    depositor: string;
    amountDeposited: string;
    totalPoolBalance: string;
}

export interface RewardsClaimedEvent {
    poolID: string;
    caller: string;
    receiver: string;
    amount: string;
    nonce: number;
}

export interface RewardPoolControllerUpdateEvent {
    poolID: string;
    account: string;
}

export interface CELKafkaPayload {
    event: string;
    transactionHash: string;
    logIndex: number;
    onChainTimestamp: number;
    offChainTimestamp: number;
    vaultID: string;
    vaultName: string;
    sequenceNumber: number;
    data:
        | RewardPoolControllerUpdateEvent
        | RewardsClaimedEvent
        | RewardsAmountDepositedEvent
        | CreatedRewardsPoolEvent
        | VaultPauseUpdateEvent
        | VaultMaxCapUpdateEvent
        | VaultClaimsManagerUpdateEvent
        | VaultHoldingAccountUpdateEvent
        | VaultOperatorUpdateEvent
        | BankBalanceUpdateV2
        | CreatedVaultEvent
        | DepositEvent
        | WithdrawEvent
        | FundsClaimedEvent
        | FundsMovedToVault
        | ProfitWithdrawRequest
        | ProfitMovedToHoldingAccount;
}
