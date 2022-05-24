const { execSync } = require('child_process');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { loadConfig } = require('use-config-json');

const defaultConfig = {
  'RETRY_TEST': 10,
  'RETRY_INTERVAL': 60,
  'RESTART_CMD': 'sudo systemctl restart tor',
  'HEALTH_CHECK': 'https://check.torproject.org/api/ip',
  'HEALTH_CHECK_INTERVAL': 300,
  'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
  'TOR_HOST': '127.0.0.1',
  'TOR_PORT': 9050
};

const config = loadConfig(defaultConfig);

const setDelay = (secs = 1) => new Promise(resolve => setTimeout(() => resolve(), secs * 1000));

const isHTTP = (host) => (new URL(host).protocol.split(':')[0] === 'http') ? true : false;

const formatTime = () => {
  const time = new Date();
  const month = time.getMonth() + 1;
  const day = time.getDate();
  const year = time.getFullYear();
  const rawHours = time.getHours();
  const hours = (rawHours > 12) ? rawHours - 12 : rawHours;
  const minutes = time.getMinutes();
  const abbreviations = (rawHours > 12) ? 'PM' : 'AM';
  return `${month}/${day}/${year} ${hours}:${minutes} ${abbreviations}`;
};

const restartTor = () => {
  try {
    const result = execSync(config.RESTART_CMD).toString();
    console.log(`${formatTime()} Restarted Tor Network Service`);
    console.log(`System log: ${result}`);
  } catch (e) {
    console.error(`${formatTime()} Restarting Tor Network Service failed`);
    console.error(`Error message: ${(e instanceof Error ? e.message : e)}`);
  }
};

/**
  Perform GET request to HEALTH_CHECK endpoint
**/
const healthCheck = async (host) => {
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
      socksOptions.username = `circuit${retry}`;
      // Handle proxy agent for onion addresses
      if (isHTTP(host)) {
        axiosOptions.httpAgent = new SocksProxyAgent(socksOptions);
      } else {
        axiosOptions.httpsAgent = new SocksProxyAgent(socksOptions);
      }

      const data = await axios.get(host, axiosOptions);
      if (data.statusText === 'error' || data.data === undefined) {
        throw new Error(`Error returned from health check point ${host}, Error: ${data.status}`);
      }
      console.log(`${formatTime()} Health check success for ${host}, server returned ${data.status}`);
      return true;
    } catch (e) {
      console.error(`${formatTime()} Failed to perform health check for ${host}, retrying`);
      console.error(`Error message: ${(e instanceof Error ? e.message : e)}`);
      retry++;
    }
    await setDelay(config.RETRY_INTERVAL);
  }
  return false;
};

const checkTor = () => {
  const startHealthCheck = async () => {
    const result = await Promise.all(config.HEALTH_CHECK.split(',').map(h => healthCheck(h)));
    if (result.filter(r => r === false).length === result.length) {
      console.error(`${formatTime()} All tests failed`);
      restartTor();
    }
  };
  startHealthCheck();
  setInterval(startHealthCheck, config.HEALTH_CHECK_INTERVAL * 1000);
};

module.exports = checkTor;
