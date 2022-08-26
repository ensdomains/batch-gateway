import { makeServer } from '../src/server';
import { ethers } from 'ethers';
import { abi as IResolverService_abi } from '@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/IResolverService.json';
import { abi as Resolver_abi } from '@ensdomains/ens-contracts/artifacts/contracts/resolvers/Resolver.sol/Resolver.json';
import { abi as Gateway_abi } from '@ensdomains/ens-contracts/artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json';
import nock from 'nock'

function getDnsName(name: string) {
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

const IResolverService = new ethers.utils.Interface(IResolverService_abi);
const GatewayI = new ethers.utils.Interface(Gateway_abi);
const ResolverI = new ethers.utils.Interface(Resolver_abi);
const TEST_ADDRESS = '0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe';
const name = 'test.eth'
const node = ethers.utils.namehash(name);
const dnsName = getDnsName(name);
const fragment = 'addr(bytes32,uint256)';
const addrData = ResolverI.encodeFunctionData(fragment, [node,60]);
const callData = IResolverService.encodeFunctionData('resolve', [ dnsName, addrData]);

const host = 'https://example.com'
const response = "0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000630897b100000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000cc51a41e97da8ceea7655c2ee316ca2692c29c250a121830815c12e6f70581d93d7bea067cfbe2abc17e779bda272c2690b1a4742c8477ab931cf5129a9d23"

describe('makeServer', () => {
  const server = makeServer();

  it('makes GET request if url includes sender and data', async () => {
    nock(host)
      .get(`/${TEST_ADDRESS}/${callData}`)
      .reply(200, {data:response})

    const { status, body } = await server.call({
      to: TEST_ADDRESS,
      data: GatewayI.encodeFunctionData('query', [[{urls:[`${host}/{sender}/{data}`], callData}]])
    });
    const { responses: decodedQuery } = GatewayI.decodeFunctionResult(
      'query',
      body.data
    );
    expect(status).toBe(200);
    expect(decodedQuery[0]).toBe(response);
  });
});