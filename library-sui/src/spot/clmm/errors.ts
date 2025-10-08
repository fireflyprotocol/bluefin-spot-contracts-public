/**
 * This file incorporates code from cetus-clmm-sui-sdk by CetusProtocol,
 * licensed under the Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
 * which can be found at https://github.com/CetusProtocol/cetus-clmm-sui-sdk/blob/main/LICENSE
 */

export enum MathErrorCode {
    IntegerDowncastOverflow = `IntegerDowncastOverflow`,
    MulOverflow = `MultiplicationOverflow`,
    MulDivOverflow = `MulDivOverflow`,
    MulShiftRightOverflow = `MulShiftRightOverflow`,
    MulShiftLeftOverflow = `MulShiftLeftOverflow`,
    DivideByZero = `DivideByZero`,
    UnsignedIntegerOverflow = `UnsignedIntegerOverflow`,
    InvalidCoinAmount = `InvalidCoinAmount`,
    InvalidLiquidityAmount = `InvalidLiquidityAmount`,
    InvalidReserveAmount = `InvalidReserveAmount`,
    InvalidSqrtPrice = `InvalidSqrtPrice`,
    NotSupportedThisCoin = `NotSupportedThisCoin`,
    InvalidTwoTickIndex = `InvalidTwoTickIndex`
}

export enum CoinErrorCode {
    CoinAmountMaxExceeded = `CoinAmountMaxExceeded`,
    CoinAmountMinSubceeded = `CoinAmountMinSubceeded `,
    SqrtPriceOutOfBounds = `SqrtPriceOutOfBounds`
}

export enum SwapErrorCode {
    InvalidSqrtPriceLimitDirection = `InvalidSqrtPriceLimitDirection`,
    ZeroTradableAmount = `ZeroTradableAmount`,
    AmountOutBelowMinimum = `AmountOutBelowMinimum`,
    AmountInAboveMaximum = `AmountInAboveMaximum`,
    NextTickNotFound = `NextTickNoutFound`,
    TickArraySequenceInvalid = `TickArraySequenceInvalid`,
    TickArrayCrossingAboveMax = `TickArrayCrossingAboveMax`,
    TickArrayIndexNotInitialized = `TickArrayIndexNotInitialized`,
    ParamsLengthNotEqual = `ParamsLengthNotEqual`
}

export enum PositionErrorCode {
    InvalidTickEvent = `InvalidTickEvent`,
    InvalidPositionObject = `InvalidPositionObject`,
    InvalidPositionRewardObject = `InvalidPositionRewardObject`
}

export enum PoolErrorCode {
    InvalidCoinTypeSequence = `InvalidCoinTypeSequence`,
    InvalidTickIndex = `InvalidTickIndex`,
    InvalidPoolObject = `InvalidPoolObject`,
    InvalidTickObjectId = `InvalidTickObjectId`,
    InvalidTickObject = `InvalidTickObject`,
    InvalidTickFields = `InvalidTickFields`
}

export enum PartnerErrorCode {
    NotFoundPartnerObject = `NotFoundPartnerObject`,
    InvalidParnterRefFeeFields = `InvalidParnterRefFeeFields`
}

export enum ConfigErrorCode {
    InvalidConfig = `InvalidConfig`,
    InvalidConfigHandle = `InvalidConfigHandle`,
    InvalidSimulateAccount = `InvalidSimulateAccount`
}

export enum UtilsErrorCode {
    InvalidSendAddress = `InvalidSendAddress`,
    InvalidRecipientAddress = `InvalidRecipientAddress`,
    InvalidRecipientAndAmountLength = `InvalidRecipientAndAmountLength`,
    InsufficientBalance = `InsufficientBalance`,
    InvalidTarget = `InvalidTarget`,
    InvalidTransactionBuilder = `InvalidTransactionBuilder`
}

export enum RouterErrorCode {
    InvalidCoin = `InvalidCoin`,
    NotFoundPath = `NotFoundPath`,
    NoDowngradeNeedParams = `NoDowngradeNeedParams`,
    InvalidSwapCountUrl = `InvalidSwapCountUrl`,
    InvalidTransactionBuilder = `InvalidTransactionBuilder`,
    InvalidServerResponse = `InvalidServerResponse`
}

export enum TypesErrorCode {
    InvalidType = `InvalidType`
}

export type ClmmpoolsErrorCode =
    | MathErrorCode
    | SwapErrorCode
    | CoinErrorCode
    | PoolErrorCode
    | PositionErrorCode
    | PartnerErrorCode
    | ConfigErrorCode
    | UtilsErrorCode
    | RouterErrorCode
    | TypesErrorCode;

export class ClmmpoolsError extends Error {
    override message: string;

    errorCode?: ClmmpoolsErrorCode;

    constructor(message: string, errorCode?: ClmmpoolsErrorCode) {
        super(message);
        this.message = message;
        this.errorCode = errorCode;
    }

    static isClmmpoolsErrorCode(e: any, code: ClmmpoolsErrorCode): boolean {
        return e instanceof ClmmpoolsError && e.errorCode === code;
    }
}
