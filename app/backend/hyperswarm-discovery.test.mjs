import { testSwarmDiscovery } from '../../server/tests/helpers/swarmDiscovery.js'

testSwarmDiscovery(new URL('../package.json', import.meta.url))
