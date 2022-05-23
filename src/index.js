const { execSync } = require('child_process');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { loadConfig } = require('use-config-json');

const defaultConfig = {
  'RETRY_TEST': 10,
  'RETRY_INTERVAL': 60,
  'RESTART_CMD': 'sudo systemctl restart tor',
  'HEALTH_CHECK': 'https://check.torproject.org/api/ip',
  'HEALTH_CHECK_ONION': '',
  'HEALTH_CHECK_INTERVAL': 1800,
  'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
  'USE_ONION': false,
  'TOR_HOST': '127.0.0.1',
  'TOR_PORT': 9050
};

const config = loadConfig(defaultConfig);

const setDelay = (secs = 1) => new Promise(resolve => setTimeout(() => resolve(), secs * 1000));

const HEALTH_CHECK = (config.USE_ONION === true) && (config.HEALTH_CHECK_ONION) ? config.HEALTH_CHECK_ONION : config.HEALTH_CHECK;
const isHTTP = (new URL(HEALTH_CHECK).protocol.split(':')[0] === 'http') ? true : false;

const restartTor = () => {
  try {
    const result = execSync(config.RESTART_CMD).toString();
    console.log('Restarted Tor Network Service');
    console.log(`System log: ${result}`);
  } catch (e) {
    console.error('Restarting Tor Network Service failed');
    console.error(`Error message: ${(e instanceof Error ? e.message : e)}`);
  }
};

/**
  Perform GET request to HEALTH_CHECK endpoint
**/
const healthCheck = async () => {
  const axiosOptions = {
    headers: {
      'User-Agent': config.USER_AGENT
    },
    timeout: 30000
  };

  let retry = 0;

  const socksOptions = {
    agentOptions: {
      keepAlive: true,
    },
    hostname: config.TOR_HOST,
    port: config.TOR_PORT
  };

  while (retry < config.RETRY_TEST) {
    try {
      // Handle proxy agent for onion addresses
      if (isHTTP) {
        axiosOptions.httpAgent = new SocksProxyAgent(socksOptions);
      } else {
        axiosOptions.httpsAgent = new SocksProxyAgent(socksOptions);
      }

      const data = await axios.get(HEALTH_CHECK, axiosOptions);
      if (data.statusText === 'error' || data.data === undefined) {
        throw new Error(`Error returned from health check point ${HEALTH_CHECK}, Error: ${data.status}`);
      }
      console.log(`Health check success, server returned ${data.status}`);
      return true;
    } catch (e) {
      console.error('Failed to perform health check, retrying');
      console.error(`Error message: ${(e instanceof Error ? e.message : e)}`);
      retry++;
    }
    await setDelay(config.RETRY_INTERVAL);
  }
  return false;
};

const checkTor = () => {
  const startHealthCheck = async () => {
    const result = await healthCheck();
    if (result === false) {
      restartTor();
    }
  };
  startHealthCheck();
  setInterval(startHealthCheck, config.HEALTH_CHECK_INTERVAL * 1000);
};

module.exports = checkTor;
