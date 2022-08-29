const formatsByCoinType = require('@ensdomains/address-encoder').formatsByCoinType;
const Command = require('commander').Command;
const ethers =  require('ethers');
const OffchainResolver_abi = require('@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/OffchainResolver.json').abi;
const IResolverService_abi = require('@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/IResolverService.json').abi;
const Resolver_abi = require('@ensdomains/ens-contracts/artifacts/contracts/resolvers/Resolver.sol/Resolver.json').abi;

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

const program = new Command();
program
  .requiredOption('-r --registry <address>', 'ENS registry address')
  .option('-p --provider <url>', 'web3 provider URL', 'http://localhost:8545/')
  .option('-i --chainId <chainId>', 'chainId', '1337')
  .option('-n --chainName <name>', 'chainName', 'unknown')
  .argument('<name>');

program.parse(process.argv);

const options = program.opts();
const ensAddress = options.registry;
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
  const resolver = await provider.getResolver(name)
  const resolverAddress = resolver.address
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
    const result = await offchainResolver.callStatic.multicall(callDatas, {ccipReadEnabled:true});
    for (let index = 0; index < coinTypes.length; index++) {
      const element = result[index];
      const coinType = coinTypes[index];
      const { result: resolveResult } = IResolverService.decodeFunctionResult('resolve', element);
      const { encoder } = formatsByCoinType[coinType];
      const addrResult = iface.decodeFunctionResult('addr(bytes32,uint256)', resolveResult)
      const hex = addrResult[0].slice(2);
      const buffered = Buffer.from(hex, 'hex');
      const decodedResult = encoder(buffered);

      console.log({name, coinType, addrResult, decodedResult})
    }
  }
})();
