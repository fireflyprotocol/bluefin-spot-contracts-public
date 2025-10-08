import BigNumber from "bignumber.js";
import { MARKET_SYMBOLS } from "./enums";

const ONE_MINUTE_IN_SECONDS = new BigNumber(60);
const ONE_HOUR_IN_SECONDS = ONE_MINUTE_IN_SECONDS.times(60);
const ONE_DAY_IN_SECONDS = ONE_HOUR_IN_SECONDS.times(24);
const ONE_YEAR_IN_SECONDS = ONE_DAY_IN_SECONDS.times(365);

export const INTEGERS = {
    ONE_MINUTE_IN_SECONDS,
    ONE_HOUR_IN_SECONDS,
    ONE_DAY_IN_SECONDS,
    ONE_YEAR_IN_SECONDS,
    ZERO: new BigNumber(0),
    ONE: new BigNumber(1),
    ONES_255: new BigNumber(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935"
    )
};

export const BASE_DECIMALS = 18;
export const SUI_NATIVE_BASE = 9;
export const BIGNUMBER_BASE = new BigNumber(1).shiftedBy(BASE_DECIMALS);
export const BIGNUMBER_ONE = new BigNumber(1);

export const BASE_DECIMALS_ON_CHAIN = 9;
export const BIGNUMBER_BASE_ON_CHAIN = new BigNumber(1).shiftedBy(BASE_DECIMALS_ON_CHAIN);

export const USDC_BASE_DECIMALS = 6;
export const ADDRESSES = {
    ZERO: "0x0000000000000000000000000000000000000000000000000000000000000000"
};

export const PRE_LAUNCH_MARKETS = [];

export const BLUE_COIN_TYPE =
    "dd5c4badc89f08fb2ff3c1827411c9bafbed54c64c17d8ab969f637364ca8b4f::blue::BLUE";

export const BLUEFIN_PACKAGES = {
    prodsui: [
        "0xc9ba51116d85cfbb401043f5e0710ab582c4b9b04a139b7df223f8f06bb66fa5",
        "0xf4f109df3ca7b7cf0ed0770a768532d8a78bbc8827a66a4fc7c2ab18856716ab",
        "0xcb4e1ee2a3d6323c70e7b06a8638de6736982cbdc08317d33e6f098747e2b438",
        "0x6cb82e162519a01b36e6a30d9813e877dc6d14282bd5436407d7a5e217b5efbe",
        "0x6a40253ed51bb476a27e5e723246bea50e4c265503d11be8d31134bf757f9bd9",
        "0x8abd42808288e8edcf18d9b0d90575b6e7764bfc07854d7891c35f7e6b0936a8",
        "0xbf8ccc28a4ef26e8f5f5ea384096c52a38552a9cd84306294631ece2348bb2cf",
        "0x2e3ad81c2c7c9afff77d42b1174abafacf03d5499514eb976a9d84029909b946",
        "0xbbfbc8ce1b1b7d77b74d77f3c7251ebfbe581023865ac5b1a7b454afc7cd9fb9",
        "0x666b7f553c139b31cd38a7e9f758db9487c7706cc99e28ecb9135d222605731d",
        "0xc070b3ed0f56b2b3cfb1588baca192ddc6b99124c5ea034cb4784b1849959c64",
        "0x4d8366a31b65feb7a87aafc090fb24dfb5c99dc21b72fda8aa0c602fe4933a1a",
        "0x35e16744133c77a59a351d054ab7bd6291ba589d2fa98a898070b404e1bf058d",
        "0x00802c52b34423ce62437fdf9a351c8869efd63674b506a5c190608567cdbca2"
    ],
    "sui-staging": [
        "0x962b86f22dd5f0d4dec32c5cf7e71f512b34c0076991ca619984896c88b06d32",
        "0xe47883215615ca8ef0156e108528a1e49f14f983d02b7a044e7dd128bc998bda",
        "0xb5af7714deb6ceb3999c9fe4bdbaa8d9a4e59b76e0e3885ba8d0d8f294eb8957",
        "0x83a7fc175b1aaac6418d44ad29907ed6742cab858b29f27c828597d0ece16b97",
        "0x04cc2b7b86583c8155d9f6869b4885cbb12278e65ac4529f6a8aa4efc21bcd57"
    ],
    "sui-dev": ["0x47cfdccf9983e41d773d663f1d7f249527059eff3a4ae2131a39ddc559a1dafb"]
};

// 3 months
export const REQUEST_LIFESPAN = 7776000000;
