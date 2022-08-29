# Batch gateway

The normal CCIP gateway can only request single record at a time.
The batch gateway will make use of of `OffchainMulticallable.multicall` function that combines multiple calls if `OffchainResolver` inherits `OffchainMulticallable` and override `batchGatewayURLs` function with the batch gateway url.

```
contract OffchainResolver is IExtendedResolver, ERC165, OffchainMulticallable {
    string[] internal batchgateways;
    string[] internal gateways;

    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    function batchGatewayURLs() internal override view returns(string[] memory) {
        return batchgateways;
    }

    constructor(string[] memory _batchGateways, string[] memory _gateways, address[] memory _signers) {
        batchgateways = _batchGateways;
        gateways = _gateways;
```

To use the batch gateway, first [start up offchain resolver by following the guide](https://github.com/ensdomains/offchain-resolver#trying-it-out). Make sure that you test client code to make sure that OffchainResolver works on its own without the batch gateway.

Then start the batch gateway server

```
yarn
yarn build
yarn start
$yarn start
yarn run v1.22.17
warning ../package.json: No license field
$ node dist/index.js
Serving on port 8081
```

To test, run `client.js`

```
$node src/client.js  --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 foo.test.eth
{
  name: 'foo.test.eth',
  coinType: 60,
  addrResult: [ '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' ],
  decodedResult: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
}
{
  name: 'foo.test.eth',
  coinType: 0,
  addrResult: [ '0x0000000000000000000000000000000000000000' ],
  decodedResult: 'bc1q9zpgru'
}
```

### How it works.

The batch client and gateway go through the following sequence.

- Call `resolver.getResolver(name)` to find the correct offchain resolver
- Encode `addr(node,coinType)` call into `addrData`
- Encode `resolver(dnsname, addrData)` into `callData`
- Combine `callData` into the array of `callDatas`
- Call `offchainResolver.multicall(callDatas, {ccipReadEnabled:true})` with CCIP-read feature enabled

ethers.js does the following behind the scene.

- Catch `OffchainLookup` error that encodes `Gateway.query(callDatas)` with callData with each gateway url

The batch gateway server does the following

- The batch gateway server decodes `Gateway.query(callDatas)` and call each gateway server in parallel

Once the client receive the response

- decode in the order of `Gateway.query` -> `ResolverService.resolve` -> `Resolver.addr(node, cointype)`
- Decode each coin cointype
