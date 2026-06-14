# Bluefin Spot

Sui smart contracts for bluefin spot exchange

## Usage

-   Install/Update submodules using `yarn submodules`
-   Install npm package dependencies using `yarn; cd library-sui; yarn`
-   Update .env file with DEPLOY_ON flag
-   Build smart contracts using `yarn build`
-   Deploy contracts using `yarn deploy`
-   To run tests, make sure the `DEPLOY_ON` in .env is set to devnet. The deployer account must have SUI token to deploy contracts and perform contract calls. Use Sui discord channel to request SUI tokens or run `sui client faucet --address` on sui client to fund the deployment account. Update "config.json" with 2 coins. You can use [this](https://github.com/fireflyprotocol/bluefin-coin-contracts/tree/myym/coins-for-tests) repo to deploy USDC and BLUE coins. Once deployed copy the `TreasuryCap` and `PackageId` from the "deployment.json" to "config.json". Run `yarn setup:tests` to deploy contracts and perform genesis actions and then do `yarn test` to run tests


## Run unit tests
- Run unit tests `sui move test`
- Run tests for coverage `sui move test --coverage`
- Show coverage report `sui move coverage summary`
- Run tests and show coverage `sui move test --coverage; sui move coverage summary`

### Handling `Test timed out` (per-test gas budget)
A few tests are computationally heavy (they iterate over wide value ranges and call the
sqrt-price / tick-conversion math repeatedly). Each unit test runs under a default
per-test gas/instruction budget, and exceeding it makes the test runner report
`Test timed out` rather than a normal failure. The two tests that are most likely to hit
this are:
- `bluefin_spot::test_tick_bitmap::test_cast_to_u8_comprehensive_*`
- `bluefin_spot::test_math::test_bit_manipulation_coverage_*`

These are split into smaller ranges so they pass under the default budget with a plain
`sui move test`. If you re-merge them (or add similarly heavy tests) and see
`Test timed out`, raise the per-test budget with the `--gas-limit` flag, e.g.:

```
# raise the per-test gas bound (value is the max gas any single test may use)
sui move test --gas-limit 1000000000

# or target just the heavy tests by name filter
sui move test test_cast_to_u8_comprehensive --gas-limit 1000000000
```

Note: `--gas-limit` bounds a single test, so set it comfortably above the cost of the
heaviest test rather than the whole suite.


## License
```
This repository is licensed under a Proprietary Smart Contract License held by Bluefin Labs Inc.
The source code is published for transparency and verification purposes only and may not be reused, modified, 
or redeployed without written permission. For inquiries, contact hi@bluefin.io.
```
