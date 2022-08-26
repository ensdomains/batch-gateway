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
const host2 = 'https://example2.com'
const response = GatewayI.encodeFunctionResult('query', [[1]])
describe('makeServer', () => {
  const server = makeServer();

  it('makes GET request if url includes sender and data', async () => {
    nock(host)
      .get(`/${TEST_ADDRESS}/${callData}.json`)
      .reply(200, {data:response})

    const { status, body } = await server.call({
      to: TEST_ADDRESS,
      data: GatewayI.encodeFunctionData('query', [[{urls:[`${host}/{sender}/{data}.json`], callData}]])
    });
    console.log('***body.data', body.data)
    const { responses: decodedQuery } = GatewayI.decodeFunctionResult(
      'query',
      body.data
    );
    expect(status).toBe(200);
    expect(decodedQuery[0]).toBe(response);
  });

  it.only('handle multiple gateways', async () => {
    nock(host)
      .get(`/${TEST_ADDRESS}/${callData}.json`)
      .reply(400)

    nock(host2)
      .get(`/${TEST_ADDRESS}/${callData}.json`)
      .reply(200, {data:response})

    const { status, body } = await server.call({
      to: TEST_ADDRESS,
      data: GatewayI.encodeFunctionData('query', [[{
        urls:[
          `${host}/{sender}/{data}.json`,
          `${host2}/{sender}/{data}.json`
        ], callData
      }]])
    });
    const { responses: decodedQuery } = GatewayI.decodeFunctionResult(
      'query',
      body.data
    );
    expect(status).toBe(200);
    expect(decodedQuery[0]).toBe(response);
  });

  it('makes POST request if url does not include data', async () => {
    nock(host, {
      reqheaders: {
        "Content-Type": "application/json"
      }
    })
      .post(`/${TEST_ADDRESS}.json`, {
        sender: TEST_ADDRESS,
        data: callData
      })
      .reply(200, {data:response})

    const { status, body } = await server.call({
      to: TEST_ADDRESS,
      data: GatewayI.encodeFunctionData('query', [[{urls:[`${host}/{sender}.json`], callData}]])
    });
    const { responses: decodedQuery } = GatewayI.decodeFunctionResult(
      'query',
      body.data
    );
    expect(status).toBe(200);
    expect(decodedQuery[0]).toBe(response);
  });
});