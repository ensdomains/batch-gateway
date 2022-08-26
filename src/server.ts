import { Server } from '@chainlink/ccip-read-server';
import { Result } from 'ethers/lib/utils';
import fetch from 'cross-fetch';
import { abi as Gateway_abi } from '@ensdomains/ens-contracts/artifacts/contracts/utils/OffchainMulticallable.sol/BatchGateway.json';

function fetchGateway (url: string, sender: any, callData: any){
  const gatewayUrl = url
    .replace('{sender}', sender)

  if(url.match("{data}")){
    return fetch(gatewayUrl.replace('{data}', callData)).then(response => response.json());
  }else{
    return fetch(gatewayUrl, {
      method: 'post',
      body: JSON.stringify({
        sender, data: callData
      }),
      headers: {'Content-Type': 'application/json'}
    }).then(response => response.json());
  }
}

export function makeServer() {
  const server = new Server();
  server.add(Gateway_abi, [
    {
      type: 'query',
      func: async ([data]: Result, request) => {
        const sender = request.to;
        let responses = await Promise.all(
          data.map((d: any) => {
            return Promise.allSettled(d.urls.map((url: string) => {
              return fetchGateway(url, sender, d.callData)
            })).then((values) => {
              // reject non 200 responses
              return values.filter(v => v.status === 'fulfilled').map((v:any) => v.value)
            });
          })
        );
        return [responses.map((r: any) => r[0].data)];
      },
    },
  ]);
  return server;
}

export function makeApp(path: string) {
  return makeServer().makeApp(path);
}
