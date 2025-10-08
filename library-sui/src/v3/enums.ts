export enum SIGNER_TYPES {
    KP_ED25519 = 0,
    KP_SECP256 = 1,
    UI_ED25519 = 2
}

export enum TRADE_TYPES {
    "NORMAL_TRADE" = 0,
    "LIQUIDATION" = 1,
    "DELEVERAGING" = 2
}

export enum PRUNE_TABLES {
    "HISTORY" = 1,
    "ORDER_FILLS" = 2
}
