const formatsByCoinType = require('@ensdomains/address-encoder').formatsByCoinType;
const Command = require('commander').Command;
const ethers =  require('ethers');
const UniversalResolver_abi = require('@ensdomains/ens-contracts/artifacts/contracts/utils/UniversalResolver.sol/UniversalResolver.json').abi;
const OffchainResolver_abi = require('@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/OffchainResolver.json').abi;
const Gateway_abi = require('@ensdomains/ens-contracts/artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json').abi;
const IResolverService_abi = require('@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/IResolverService.json').abi;
const Resolver_abi = require('@ensdomains/ens-contracts/artifacts/contracts/resolvers/Resolver.sol/Resolver.json').abi;
const fetch = require('cross-fetch');

const IResolverService = new ethers.utils.Interface(IResolverService_abi);

function getDnsName(name) {
  const n = name.replace(/^\.|\.$/gm, '');

  var bufLen = n === '' ? 1 : n.length + 2;
  var buf = Buffer.allocUnsafe(bufLen);

  let offset = 0;
  if (n.length) {
    const list = n.split('.');
    for (let i = 0; i < list.length; i++) {
      const len = buf.write(list[i], offset + 1);
      buf[offset] = len;
      offset += len + 1;
    }
  }
  buf[offset++] = 0;
  return (
    '0x' +
    buf.reduce(
      (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
      ''
    )
  );
}

const GatewayI = new ethers.utils.Interface(Gateway_abi);
const program = new Command();
program
  .requiredOption('-r --registry <address>', 'ENS registry address')
  .option('-p --provider <url>', 'web3 provider URL', 'http://localhost:8545/')
  .option('-i --chainId <chainId>', 'chainId', '1337')
  .option('-n --chainName <name>', 'chainName', 'unknown')
  .option('-u --uAddress <uaddress>', 'Universal Resolver address')
  .argument('<name>');

program.parse(process.argv);

const options = program.opts();
const ensAddress = options.registry;
const uAddress = options.uAddress;
const chainId = parseInt(options.chainId);
const chainName = options.chainName;
const provider = new ethers.providers.JsonRpcProvider(options.provider, {
  chainId,
  name: chainName,
  ensAddress,
});
(async () => {
  const name = program.args[0] || 'test.eth';
  const node = ethers.utils.namehash(name);
  const dnsName = getDnsName(name);
  const uResolver = new ethers.Contract(
    uAddress,
    UniversalResolver_abi,
    provider
  );

  const [resolverAddress] = await uResolver.callStatic.findResolver(dnsName);
  if (resolverAddress) {
    const offchainResolver = new ethers.Contract(
      resolverAddress,
      OffchainResolver_abi,
      provider
    );

    const iface = new ethers.utils.Interface(Resolver_abi);
    const coinTypes = [60, 0];
    const callDatas = coinTypes.map(coinType => {
      const addrData = iface.encodeFunctionData('addr(bytes32,uint256)', [
        node,
        coinType,
      ]);
      return IResolverService.encodeFunctionData('resolve', [
        dnsName,
        addrData,
      ]);
    });
    try {
      await offchainResolver.callStatic.multicall(callDatas);
    } catch (e) {
      if (e && e.errorArgs) {
        const url = e.errorArgs.urls[0];
        const lowerTo = e.errorArgs.sender.toLowerCase();
        const callData = e.errorArgs.callData;
        const gatewayUrl = url
          .replace('{sender}', lowerTo)
          .replace('{data}', callData);
        const result = await fetch(gatewayUrl);
        const { data: resultData } = await result.json();
        const { responses: decodedQuery } = GatewayI.decodeFunctionResult(
          'query',
          resultData
        );
        for (let index = 0; index < decodedQuery.length; index++) {
          const dq = decodedQuery[index];
          const { result: addrResult } = IResolverService.decodeFunctionResult(
            'resolve',
            dq
          );
          const coinType = coinTypes[index];
          const { encoder } = formatsByCoinType[coinType];
          const finalResult = iface.decodeFunctionResult(
            'addr(bytes32,uint256)',
            addrResult
          );
          const hex = finalResult[0].slice(2);
          const buffered = Buffer.from(hex, 'hex');
          const decodedResult = encoder(buffered);
          console.log({ name, coinType, finalResult, decodedResult });
        }
      } else {
        console.log(105, e);
      }
    }
  }
})();
